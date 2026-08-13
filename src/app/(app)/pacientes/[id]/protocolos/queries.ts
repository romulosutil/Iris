import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  evidence,
  goal,
  goalCandidacy,
  goalMilestoneMapping,
  milestone,
  patient,
  patientProtocol,
  protocol,
} from "@/db/schema";
import type {
  ProtocolProgressData,
  TrendSessionPoint,
} from "@/components/ui/protocol-dashboard-charts";

/**
 * Estados de meta que CONTAM no denominador (`totalMetas`) dos gráficos:
 * `rascunho` (ainda não validada) e `descontinuada` (abandonada) ficam fora
 * — o progresso mede o repertório em construção real, não intenção nem lixo.
 */
const ESTADOS_CONTABEIS = ["ativa", "dominada", "pausada"] as const;

export interface ProtocolDashboardMetrics {
  paciente: { nome: string };
  /** Um item por protocolo ATIVO do paciente (vigência aberta). */
  protocolos: ProtocolProgressData[];
  /** Evolução cumulativa de evidências aprovadas, por sessão. */
  tendencia: TrendSessionPoint[];
  /** Visão comparativa do PEI: um item por disciplina (ABA/Fono/TO) presente nas metas. */
  porDisciplina: ProtocolProgressData[];
}

type MetaAgregavel = {
  id: string;
  estado: string;
  disciplina: string | null;
  isCandidataIA: boolean;
};

function agregarMetas(nome: string, metas: MetaAgregavel[]): ProtocolProgressData {
  const contabeis = metas.filter((m) =>
    (ESTADOS_CONTABEIS as readonly string[]).includes(m.estado),
  );
  const metasDominadas = contabeis.filter((m) => m.estado === "dominada").length;
  // Honestidade epistêmica: candidatura de IA é SUGESTÃO pendente de validação
  // do coordenador — só conta se a meta ainda NÃO foi dominada (sem dupla contagem).
  const metasSugeridasIA = contabeis.filter(
    (m) => m.isCandidataIA && m.estado !== "dominada",
  ).length;
  return {
    protocoloNome: nome,
    totalMetas: contabeis.length,
    metasDominadas,
    metasSugeridasIA,
  };
}

/**
 * Métricas do dashboard de protocolos do paciente (issue #250).
 *
 * Vínculo meta↔protocolo: `goal` não tem `protocol_id` direto — o caminho
 * honesto que o schema suporta é `goal → goal_milestone_mapping → milestone →
 * protocol`. Meta mapeada a marcos de N protocolos conta em cada um; meta SEM
 * mapeamento de marco não aparece na visão por protocolo (aparece na visão por
 * disciplina, que agrega direto por `goal.disciplina`).
 *
 * `totalMetas` = metas em estado ativa|dominada|pausada (ver ESTADOS_CONTABEIS).
 * `metasSugeridasIA` = metas com `goal_candidacy.is_candidate_dominada = true`
 * e estado ≠ dominada. Tendência = contagem cumulativa de `evidence` do
 * paciente por `session_numero`.
 *
 * RLS via `withTenant` é a fronteira de tenant — sem filtro clinic_id manual.
 * Paciente inexistente/fora do tenant → null (page faz notFound()).
 */
export async function getProtocolDashboardMetrics(
  ctx: TenantContext,
  patientId: string,
): Promise<ProtocolDashboardMetrics | null> {
  return withTenant(ctx, async (tx) => {
    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, patientId));
    if (!pac) return null;

    // Protocolos ATIVOS (vigência aberta) do paciente.
    const protocolosAtivos = await tx
      .select({ id: protocol.id, nome: protocol.nome, disciplina: protocol.disciplina })
      .from(patientProtocol)
      .innerJoin(protocol, eq(protocol.id, patientProtocol.protocolId))
      .where(
        and(eq(patientProtocol.patientId, patientId), isNull(patientProtocol.desativadoEm)),
      )
      .orderBy(asc(protocol.nome));

    // Metas do paciente + candidatura IA (left join manual em duas leituras).
    const metasRows = await tx
      .select({ id: goal.id, estado: goal.estado, disciplina: goal.disciplina })
      .from(goal)
      .where(eq(goal.patientId, patientId));

    const goalIds = metasRows.map((m) => m.id);
    const candidaturas = goalIds.length
      ? await tx
          .select({ goalId: goalCandidacy.goalId })
          .from(goalCandidacy)
          .where(
            and(
              inArray(goalCandidacy.goalId, goalIds),
              eq(goalCandidacy.isCandidateDominada, true),
            ),
          )
      : [];
    const candidatas = new Set(candidaturas.map((c) => c.goalId));

    const metas: MetaAgregavel[] = metasRows.map((m) => ({
      ...m,
      isCandidataIA: candidatas.has(m.id),
    }));

    // Vínculo meta↔protocolo via marcos mapeados (distinct por par).
    const mapeamentos = goalIds.length
      ? await tx
          .select({
            goalId: goalMilestoneMapping.goalId,
            protocolId: milestone.protocolId,
          })
          .from(goalMilestoneMapping)
          .innerJoin(milestone, eq(milestone.id, goalMilestoneMapping.milestoneId))
          .where(inArray(goalMilestoneMapping.goalId, goalIds))
      : [];
    const goalsPorProtocolo = new Map<string, Set<string>>();
    for (const m of mapeamentos) {
      const set = goalsPorProtocolo.get(m.protocolId) ?? new Set<string>();
      set.add(m.goalId);
      goalsPorProtocolo.set(m.protocolId, set);
    }
    const metaPorId = new Map(metas.map((m) => [m.id, m]));

    const protocolos: ProtocolProgressData[] = protocolosAtivos.map((p) => {
      const ids = goalsPorProtocolo.get(p.id) ?? new Set<string>();
      const metasDoProtocolo = [...ids]
        .map((id) => metaPorId.get(id))
        .filter((m): m is MetaAgregavel => m != null);
      return agregarMetas(p.nome, metasDoProtocolo);
    });

    // Visão comparativa por disciplina (só disciplinas presentes nas metas).
    const disciplinas = [
      ...new Set(metas.map((m) => m.disciplina).filter((d): d is string => d != null)),
    ].sort();
    const porDisciplina: ProtocolProgressData[] = disciplinas.map((d) =>
      agregarMetas(d, metas.filter((m) => m.disciplina === d)),
    );

    // Tendência: evidências aprovadas do paciente, cumulativas por sessão.
    const evidencias = await tx
      .select({ sessionNumero: evidence.sessionNumero, aprovadoEm: evidence.aprovadoEm })
      .from(evidence)
      .where(eq(evidence.patientId, patientId))
      .orderBy(asc(evidence.sessionNumero));

    const porSessao = new Map<number, { conta: number; data?: Date }>();
    for (const e of evidencias) {
      const atual = porSessao.get(e.sessionNumero) ?? { conta: 0 };
      atual.conta += 1;
      atual.data ??= e.aprovadoEm;
      porSessao.set(e.sessionNumero, atual);
    }
    let acumulado = 0;
    const tendencia: TrendSessionPoint[] = [...porSessao.entries()]
      .sort(([a], [b]) => a - b)
      .map(([sessaoNumero, agg]) => {
        acumulado += agg.conta;
        return {
          sessaoNumero,
          sessaoData: agg.data?.toISOString().slice(0, 10),
          evidenciasAcumuladas: acumulado,
          conquistasNoDia: agg.conta,
        };
      });

    return { paciente: { nome: pac.nome }, protocolos, tendencia, porDisciplina };
  });
}
