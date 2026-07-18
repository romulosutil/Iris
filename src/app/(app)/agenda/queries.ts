import { and, asc, eq, gte, ilike, lte } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";
import { diasDaSemana } from "@/lib/agenda/semana";
import { paraMinutosLocais } from "@/lib/agenda/fuso-min";
import {
  projetarSemana,
  type AvulsaProjecao,
  type BlocoAgenda,
  type RegraProjecao,
} from "@/lib/agenda/projecao";
import type { FaixaDia } from "@/lib/agenda/janela";

export async function listarPacientes(
  ctx: TenantContext,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: schema.patient.id, nome: schema.patient.nome })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.clinicId, ctx.clinicId),
          ilike(schema.patient.nome, `%${termo}%`),
        ),
      )
      .orderBy(asc(schema.patient.nome))
      .limit(20),
  );
}

export interface CarregarSemanaParams {
  eixo: "terapeuta" | "paciente";
  entidadeId: string;
  semanaInicioISO: string;
}
export interface SemanaCarregada {
  blocos: BlocoAgenda[];
  janelas: FaixaDia[]; // só preenchido quando eixo="terapeuta"
  bloqueios: { dataInicio: string; dataFim: string }[];
}

export async function carregarSemana(
  ctx: TenantContext,
  { eixo, entidadeId, semanaInicioISO }: CarregarSemanaParams,
): Promise<SemanaCarregada> {
  requireRole(ctx, "coordenador");
  const dias = diasDaSemana(semanaInicioISO);
  const primeiro = dias[0]!;
  const ultimo = dias[6]!;
  const colEntidade =
    eixo === "terapeuta"
      ? schema.agendamentoRecorrente.terapeutaId
      : schema.agendamentoRecorrente.patientId;
  const colRotulo =
    eixo === "terapeuta" ? schema.patient.nome : schema.appUser.name;

  return withTenant(ctx, async (tx) => {
    // Regras ativas vigentes na semana (previsto).
    const regrasRaw = await tx
      .select({
        id: schema.agendamentoRecorrente.id,
        diaSemana: schema.agendamentoRecorrente.diaSemana,
        horaInicio: schema.agendamentoRecorrente.horaInicio,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
        disciplina: schema.agendamentoRecorrente.disciplina,
        rotulo: colRotulo,
      })
      .from(schema.agendamentoRecorrente)
      .innerJoin(
        schema.patient,
        eq(schema.agendamentoRecorrente.patientId, schema.patient.id),
      )
      .innerJoin(
        schema.appUser,
        eq(schema.agendamentoRecorrente.terapeutaId, schema.appUser.id),
      )
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(colEntidade, entidadeId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
          lte(schema.agendamentoRecorrente.vigenciaInicio, ultimo),
        ),
      );
    const regras: RegraProjecao[] = regrasRaw.map((r) => ({
      id: r.id,
      diaSemana: r.diaSemana,
      horaInicio: r.horaInicio,
      duracaoMin: r.duracaoMin,
      disciplina: r.disciplina,
      rotulo: r.rotulo ?? "—",
    }));

    // Avulsas (session recorrenteId null) na janela de datas (concreto).
    const colSessEntidade =
      eixo === "terapeuta" ? schema.session.terapeutaId : schema.session.patientId;
    const avulsasRaw = await tx
      .select({
        id: schema.session.id,
        agendadaPara: schema.session.agendadaPara,
        duracaoMin: schema.session.duracaoMin,
        disciplina: schema.session.disciplina,
        rotulo: colRotulo,
      })
      .from(schema.session)
      .innerJoin(schema.patient, eq(schema.session.patientId, schema.patient.id))
      .innerJoin(schema.appUser, eq(schema.session.terapeutaId, schema.appUser.id))
      .where(
        and(
          eq(schema.session.clinicId, ctx.clinicId),
          eq(colSessEntidade, entidadeId),
          gte(
            schema.session.agendadaPara,
            new Date(`${primeiro}T00:00:00${FUSO_CLINICA_OFFSET}`),
          ),
          lte(
            schema.session.agendadaPara,
            new Date(`${ultimo}T23:59:59${FUSO_CLINICA_OFFSET}`),
          ),
        ),
      );
    const avulsas: AvulsaProjecao[] = avulsasRaw.map((a) => {
      const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, FUSO_CLINICA);
      return {
        id: a.id,
        diaSemana,
        inicioMin,
        duracaoMin: a.duracaoMin,
        disciplina: a.disciplina ?? "—",
        rotulo: a.rotulo ?? "—",
      };
    });

    // Janelas de trabalho (só no eixo terapeuta).
    let janelas: FaixaDia[] = [];
    if (eixo === "terapeuta") {
      const jr = await tx
        .select({
          diaSemana: schema.janelaTrabalho.diaSemana,
          horaInicio: schema.janelaTrabalho.horaInicio,
          horaFim: schema.janelaTrabalho.horaFim,
        })
        .from(schema.janelaTrabalho)
        .where(eq(schema.janelaTrabalho.terapeutaId, entidadeId));
      janelas = jr.map((j) => ({
        diaSemana: j.diaSemana,
        horaInicio: j.horaInicio,
        horaFim: j.horaFim,
      }));
    }

    // Bloqueios que tocam a semana (do escopo aplicável).
    const bloq = await tx
      .select({
        dataInicio: schema.bloqueio.dataInicio,
        dataFim: schema.bloqueio.dataFim,
      })
      .from(schema.bloqueio)
      .where(
        and(
          eq(schema.bloqueio.clinicId, ctx.clinicId),
          lte(schema.bloqueio.dataInicio, ultimo),
          gte(schema.bloqueio.dataFim, primeiro),
        ),
      );

    return { blocos: projetarSemana(regras, avulsas), janelas, bloqueios: bloq };
  });
}

/** Aviso suave por-paciente (C8): as faixas de trabalho do terapeuta no dia. */
export async function disponibilidadeTerapeutaNoDia(
  ctx: TenantContext,
  terapeutaId: string,
  diaISO: string,
): Promise<FaixaDia[]> {
  requireRole(ctx, "coordenador");
  const diaSemana = new Date(`${diaISO}T00:00:00Z`).getUTCDay();
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        diaSemana: schema.janelaTrabalho.diaSemana,
        horaInicio: schema.janelaTrabalho.horaInicio,
        horaFim: schema.janelaTrabalho.horaFim,
      })
      .from(schema.janelaTrabalho)
      .where(
        and(
          eq(schema.janelaTrabalho.terapeutaId, terapeutaId),
          eq(schema.janelaTrabalho.diaSemana, diaSemana),
        ),
      );
    return rows.map((j) => ({
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
    }));
  });
}
