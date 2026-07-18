import { and, asc, eq, gte, ilike, lte } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";
import { diasDaSemana, vigenciaInicioC7 } from "@/lib/agenda/semana";
import { paraMinutosLocais } from "@/lib/agenda/fuso-min";
import {
  projetarSemana,
  type AvulsaProjecao,
  type BlocoAgenda,
  type RegraProjecao,
} from "@/lib/agenda/projecao";
import { horaParaMin, type FaixaDia } from "@/lib/agenda/janela";
import { conflita, type Slot } from "@/lib/agenda/conflito";

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

export class ConflitoError extends Error {
  constructor(public dimensao: "terapeuta" | "paciente") {
    super(`Horário em conflito para ${dimensao}.`);
    this.name = "ConflitoError";
  }
}

export interface NovaRegra {
  patientId: string;
  terapeutaId: string;
  disciplina: string;
  diaSemana: number;
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  semanaVisivelISO: string;
  hojeISO: string;
}

/** C1: cria só a regra recorrente (nenhuma linha `session`). C2/C5: pré-check
 * de conflito nas 2 dimensões (terapeuta e paciente) antes de gravar. */
export async function criarRegra(
  ctx: TenantContext,
  dados: NovaRegra,
): Promise<{ id: string }> {
  requireRole(ctx, "coordenador");
  const inicioMin = horaParaMin(dados.horaInicio);
  const novo: Slot = {
    diaSemana: dados.diaSemana,
    inicioMin,
    fimMin: inicioMin + dados.duracaoMin,
  };
  const vigenciaInicio = vigenciaInicioC7(dados.semanaVisivelISO, dados.hojeISO);

  return withTenant(ctx, async (tx) => {
    const ativas = await tx
      .select({
        terapeutaId: schema.agendamentoRecorrente.terapeutaId,
        patientId: schema.agendamentoRecorrente.patientId,
        diaSemana: schema.agendamentoRecorrente.diaSemana,
        horaInicio: schema.agendamentoRecorrente.horaInicio,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
      })
      .from(schema.agendamentoRecorrente)
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
          eq(schema.agendamentoRecorrente.diaSemana, dados.diaSemana),
        ),
      );
    const paraSlots = (rows: typeof ativas): Slot[] =>
      rows.map((r) => {
        const ini = horaParaMin(r.horaInicio);
        return { diaSemana: r.diaSemana, inicioMin: ini, fimMin: ini + r.duracaoMin };
      });
    if (conflita(novo, paraSlots(ativas.filter((r) => r.terapeutaId === dados.terapeutaId)))) {
      throw new ConflitoError("terapeuta");
    }
    if (conflita(novo, paraSlots(ativas.filter((r) => r.patientId === dados.patientId)))) {
      throw new ConflitoError("paciente");
    }
    const [row] = await tx
      .insert(schema.agendamentoRecorrente)
      .values({
        clinicId: ctx.clinicId,
        patientId: dados.patientId,
        terapeutaId: dados.terapeutaId,
        disciplina: dados.disciplina,
        diaSemana: dados.diaSemana,
        horaInicio: dados.horaInicio,
        duracaoMin: dados.duracaoMin,
        vigenciaInicio,
        status: "ativo",
      })
      .returning({ id: schema.agendamentoRecorrente.id });
    return row!;
  });
}

export interface NovaAvulsa {
  patientId: string;
  terapeutaId: string;
  disciplina: string;
  tipo: "avaliacao" | "devolutiva" | "reuniao_pais" | "outro";
  dataISO: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  modalidade: "presencial" | "online";
}

/** Cria uma sessão avulsa (`recorrenteId=null`, `estado="agendada"`), ancorada
 * no fuso da clínica (C10). O EXCLUDE gist do banco (`session_no_overbook_*`)
 * é o backstop TOCTOU contra overbook concorrente — a violação (23P01) é
 * capturada aqui e relançada como `ConflitoError`. */
export async function criarAvulsa(
  ctx: TenantContext,
  dados: NovaAvulsa,
): Promise<{ id: string }> {
  requireRole(ctx, "coordenador");
  const agendadaPara = new Date(
    `${dados.dataISO}T${dados.horaInicio}:00${FUSO_CLINICA_OFFSET}`,
  );
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(schema.session)
        .values({
          clinicId: ctx.clinicId,
          patientId: dados.patientId,
          terapeutaId: dados.terapeutaId,
          recorrenteId: null,
          disciplina: dados.disciplina,
          tipo: dados.tipo,
          agendadaPara,
          duracaoMin: dados.duracaoMin,
          estado: "agendada",
          modalidade: dados.modalidade,
        })
        .returning({ id: schema.session.id });
      return row!;
    });
  } catch (e) {
    // EXCLUDE gist (btree_gist) → SQLSTATE 23P01 exclusion_violation. O driver
    // postgres-js lança o erro cru; o drizzle-orm o envolve em
    // DrizzleQueryError com o original em `.cause` — checar os dois.
    const code =
      (e as { code?: string } | undefined)?.code ??
      (e as { cause?: { code?: string } } | undefined)?.cause?.code;
    if (code === "23P01") {
      throw new ConflitoError("terapeuta");
    }
    throw e;
  }
}

export interface ConfigClinica {
  disciplinas: string[];
  duracaoDisciplina: Record<string, number>;
}

/** Config da clínica p/ pré-preencher o popover de alocação (D2): disciplinas
 * conhecidas e duração padrão por disciplina (`clinic.duracaoDisciplina`). */
export async function carregarConfigClinica(ctx: TenantContext): Promise<ConfigClinica> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ duracaoDisciplina: schema.clinic.duracaoDisciplina })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    const duracaoDisciplina = (row?.duracaoDisciplina as Record<string, number> | undefined) ?? {};
    return { disciplinas: Object.keys(duracaoDisciplina), duracaoDisciplina };
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
