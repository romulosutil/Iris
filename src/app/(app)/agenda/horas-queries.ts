import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import {
  alocadoTerapeuta,
  horasAgendadasPorDisciplina,
  horasRealizadasPorDisciplina,
  temDefasagemSustentada,
  vagoTerapeuta,
  type RegraAtiva,
  type SessaoRealizada,
} from "@/lib/agenda/horas";
import { horasDisponiveisSemana, type FaixaDia } from "@/lib/agenda/janela";
import { diasDaSemana, segundaDaSemana } from "@/lib/agenda/semana";

/** Papéis que leem os painéis de carga horária (perfil paciente/terapeuta).
 * RLS (`withTenant`) escopa por clínica por baixo; isto restringe a leitura à
 * equipe clínica + recepção — mesma família de gates das outras reads da agenda. */
function requireLeituraHoras(ctx: TenantContext): void {
  requireRole(ctx, "terapeuta", "coordenador", "admin_recepcao");
}

export interface HorasDisciplina {
  disciplina: string;
  alvo: number | null;
  agendado: number;
  realizado: number;
  alerta: boolean;
}

/**
 * Carga horária por disciplina de um paciente: alvo prescrito (vigente) vs.
 * agendado (regras ativas) vs. realizado (média semanal de sessões
 * `realizada`). Une TODAS as disciplinas que aparecem em alvo, agendado ou
 * realizado — uma disciplina com alvo mas sem regra ainda aparece (agendado=0).
 *
 * `alerta`: v1 usa o snapshot atual (`agendado < alvo`) via `temDefasagemSustentada`
 * com limiar 1 — não há reconstrução semana-a-semana barata do histórico de
 * agendado, então "abaixo do prescrito" é avaliado sobre a semana corrente. O
 * cálculo puro fica em `horas.ts`; aqui só buscamos linhas e alimentamos.
 */
export async function carregarHorasPaciente(
  ctx: TenantContext,
  patientId: string,
): Promise<HorasDisciplina[]> {
  requireLeituraHoras(ctx);
  const hojeISO = new Date().toISOString().slice(0, 10);

  return withTenant(ctx, async (tx) => {
    // Alvo VIGENTE por disciplina — `vigencia_fim IS NULL`, só.
    //
    // Antes o filtro também aceitava `vigencia_fim >= hoje`, e isso quebrou com
    // a represcrição pela ficha clínica (#203, fatia 2): represcrever fecha a
    // linha antiga com a data de HOJE e abre a nova no mesmo dia, então as duas
    // casavam e `alvoPorDisc[disciplina]` ficava com a que o Postgres devolvesse
    // por último — o teto da disciplina virava sorteio no dia da mudança.
    //
    // Vigência fechada não é vigência: é o mesmo critério do `app_is_on_team`
    // na RLS (o vínculo encerrado perde acesso na hora, sem carência) e o que
    // todo o #203 usa para somar saldo.
    const alvoRows = await tx
      .select({
        disciplina: schema.patientAlvoDisciplina.disciplina,
        horasAlvoSemana: schema.patientAlvoDisciplina.horasAlvoSemana,
      })
      .from(schema.patientAlvoDisciplina)
      .where(
        and(
          eq(schema.patientAlvoDisciplina.clinicId, ctx.clinicId),
          eq(schema.patientAlvoDisciplina.patientId, patientId),
          isNull(schema.patientAlvoDisciplina.vigenciaFim),
        ),
      );
    const alvoPorDisc: Record<string, number> = {};
    for (const r of alvoRows) alvoPorDisc[r.disciplina] = Number(r.horasAlvoSemana);

    // agendado: regras ativas vigentes do paciente → horas por disciplina.
    const regraRows = await tx
      .select({
        disciplina: schema.agendamentoRecorrente.disciplina,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
      })
      .from(schema.agendamentoRecorrente)
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(schema.agendamentoRecorrente.patientId, patientId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
          or(
            isNull(schema.agendamentoRecorrente.vigenciaFim),
            gte(schema.agendamentoRecorrente.vigenciaFim, hojeISO),
          ),
        ),
      );
    const regras: RegraAtiva[] = regraRows.map((r) => ({
      disciplina: r.disciplina,
      duracaoMin: r.duracaoMin,
    }));
    const agendadoPorDisc = horasAgendadasPorDisciplina(regras);

    // realizado: sessões `realizada` do paciente → média semanal por disciplina.
    const sessRows = await tx
      .select({
        disciplina: schema.session.disciplina,
        duracaoMin: schema.session.duracaoMin,
        agendadaPara: schema.session.agendadaPara,
      })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.clinicId, ctx.clinicId),
          eq(schema.session.patientId, patientId),
          eq(schema.session.estado, "realizada"),
        ),
      );
    const sessoes: SessaoRealizada[] = sessRows.map((s) => ({
      disciplina: s.disciplina,
      duracaoMin: s.duracaoMin,
      agendadaPara: new Date(s.agendadaPara),
    }));
    const realizadoPorDisc = horasRealizadasPorDisciplina(sessoes, new Date());

    // União das disciplinas presentes em qualquer fonte.
    const disciplinas = new Set<string>([
      ...Object.keys(alvoPorDisc),
      ...Object.keys(agendadoPorDisc),
      ...Object.keys(realizadoPorDisc),
    ]);

    return [...disciplinas]
      .sort()
      .map((disciplina) => {
        const alvo = alvoPorDisc[disciplina] ?? null;
        const agendado = agendadoPorDisc[disciplina] ?? 0;
        const realizado = realizadoPorDisc[disciplina] ?? 0;
        const alerta =
          alvo != null && temDefasagemSustentada([{ alvo, agendado }], 1);
        return { disciplina, alvo, agendado, realizado, alerta };
      });
  });
}

export interface HorasTerapeuta {
  capacidade: number;
  alocado: number;
  vago: number;
  pacientes: { id: string; nome: string }[];
}

/**
 * Carga horária de um terapeuta: capacidade (janelas de trabalho) vs. alocado
 * (regras ativas) vs. vago (capacidade − alocado − bloqueado). `pacientes` são
 * os pacientes fixos (distintos das regras ativas do terapeuta).
 *
 * `horasBloqueadas`: descontamos as horas de janela que caem em dias da SEMANA
 * CORRENTE cobertos por um bloqueio aplicável (clínica ou este terapeuta). Sem
 * bloqueio no período → 0. Aproximação por dia-da-semana (não sub-diária): um
 * bloqueio que cobre um dia zera as janelas daquele dia na semana.
 */
export async function carregarHorasTerapeuta(
  ctx: TenantContext,
  terapeutaId: string,
): Promise<HorasTerapeuta> {
  requireLeituraHoras(ctx);
  const dias = diasDaSemana(segundaDaSemana(new Date().toISOString().slice(0, 10)));
  const semanaInicio = dias[0]!;
  const semanaFim = dias[6]!;

  return withTenant(ctx, async (tx) => {
    // capacidade: janelas de trabalho do terapeuta.
    const janelaRows = await tx
      .select({
        diaSemana: schema.janelaTrabalho.diaSemana,
        horaInicio: schema.janelaTrabalho.horaInicio,
        horaFim: schema.janelaTrabalho.horaFim,
      })
      .from(schema.janelaTrabalho)
      .where(eq(schema.janelaTrabalho.terapeutaId, terapeutaId));
    const janelas: FaixaDia[] = janelaRows.map((j) => ({
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
    }));
    const capacidade = horasDisponiveisSemana(janelas);

    // alocado: regras ativas do terapeuta.
    const regraRows = await tx
      .select({
        patientId: schema.agendamentoRecorrente.patientId,
        pacienteNome: schema.patient.nome,
        disciplina: schema.agendamentoRecorrente.disciplina,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
      })
      .from(schema.agendamentoRecorrente)
      .innerJoin(
        schema.patient,
        eq(schema.agendamentoRecorrente.patientId, schema.patient.id),
      )
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(schema.agendamentoRecorrente.terapeutaId, terapeutaId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
        ),
      );
    const alocado = alocadoTerapeuta(
      regraRows.map((r) => ({ disciplina: r.disciplina, duracaoMin: r.duracaoMin })),
    );

    // pacientes fixos distintos (preserva 1ª aparição, ordena por nome).
    const vistos = new Map<string, string>();
    for (const r of regraRows) if (!vistos.has(r.patientId)) vistos.set(r.patientId, r.pacienteNome);
    const pacientes = [...vistos.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    // bloqueado: janelas em dias-da-semana cobertos por bloqueio na semana corrente.
    const bloqRows = await tx
      .select({
        dataInicio: schema.bloqueio.dataInicio,
        dataFim: schema.bloqueio.dataFim,
      })
      .from(schema.bloqueio)
      .where(
        and(
          eq(schema.bloqueio.clinicId, ctx.clinicId),
          or(
            eq(schema.bloqueio.escopo, "clinica"),
            and(
              eq(schema.bloqueio.escopo, "terapeuta"),
              eq(schema.bloqueio.terapeutaId, terapeutaId),
            ),
          ),
          lte(schema.bloqueio.dataInicio, semanaFim),
          gte(schema.bloqueio.dataFim, semanaInicio),
        ),
      );
    const diasBloqueados = new Set<number>();
    for (const b of bloqRows) {
      dias.forEach((diaISO, i) => {
        if (diaISO >= b.dataInicio && diaISO <= b.dataFim) {
          diasBloqueados.add(i === 6 ? 0 : i + 1); // índice seg..dom → diaSemana 0..6
        }
      });
    }
    const horasBloqueadas = horasDisponiveisSemana(
      janelas.filter((j) => diasBloqueados.has(j.diaSemana)),
    );

    return {
      capacidade,
      alocado,
      vago: vagoTerapeuta(capacidade, alocado, horasBloqueadas),
      pacientes,
    };
  });
}
