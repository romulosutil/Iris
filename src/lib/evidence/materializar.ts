/**
 * Serviço de materialização de `session_snapshot` (Fase 4 · 4B).
 *
 * Fonte: docs/superpowers/specs/2026-07-13-fase-4-compute-segmentacao.md.
 * Lê `evidence_current` do paciente (RLS-escopado — o chamador passa uma
 * `MaterializarQueries` construída sobre uma transação `withTenant`), computa
 * repertório + segmentação com o módulo puro `segmentacao.ts`, e grava via os
 * UPSERTs privilegiados `app_aplicar_snapshot`/`app_aplicar_candidatura`
 * (0017, SECURITY DEFINER).
 *
 * Driver-agnostic (mesmo padrão de `resolver.ts`): recebe `MaterializarQueries`
 * em vez de acoplar a um cliente de banco concreto.
 *
 * JULGAMENTOS CLÍNICOS/DE DESENHO — flag para o tech lead (ver relatório):
 *  1. `session_snapshot` só é materializado para números de sessão que
 *     tiveram AO MENOS UMA evidência do paciente (qualquer goal/protocolo) —
 *     não para todo `session_numero` sequencial. Consumidores que leem
 *     "estado as-of sessão N" devem buscar a última linha com
 *     `session_numero <= N`, não assumir 1 linha por sessão. A spec não fixa
 *     isso explicitamente; a alternativa (preencher todo número de sessão,
 *     mesmo sem evidência nova) preencheria linhas idênticas sem ganho e
 *     multiplicaria a escrita.
 *  2. `repertorio_state` é chaveado por `goal_id` (ou, na ausência de goal_id
 *     resolvido mas com `milestone_id` resolvido, por `` `milestone:${id}` ``)
 *     e agrega TODOS os protocolos daquele goal em UMA leitura de "nível mais
 *     recente" (sem comparar ordinais entre protocolos — só reporta o último
 *     observado, o que é seguro porque não há subtração/comparação cruzada,
 *     só leitura do estado corrente). `segmentacao`, por outro lado, é
 *     sub-chaveada por `protocol_id` (nunca funde famílias), como a spec exige.
 *  3. Evidence sem `goal_id` resolvido (alvo cujo `goal_ref` não bateu com
 *     nenhum goal do paciente) é EXCLUÍDA da segmentação/repertório — não há
 *     grão de meta para atribuir. Fica de fora silenciosamente (não é erro:
 *     a resolução best-effort já documenta que isso pode ficar `null`).
 *  4. `milestone_candidacy`: implementado como TODO explícito (ver função
 *     `recomputarCandidaturaMarco` abaixo) — a spec pede critério "por
 *     Milestone/família", mas o modelo de dados atual (`Milestone`) não
 *     carrega um critério de candidatura próprio (N evidências independentes
 *     positivas em M sessões) nem uma flag "família PROC/observação exclui
 *     desta candidatura por acúmulo". Adivinhar esses parâmetros seria
 *     inventar critério clínico sem lastro — por isso NÃO escrevo
 *     `milestone_candidacy` nesta tarefa. `goal_candidacy` (que TEM
 *     `Goal.criterio_dominio` explícito no schema) está implementado.
 */
import { eq, sql as dsql } from "drizzle-orm";
import type postgres from "postgres";
import {
  goal as goalTable,
  goalCandidacy as goalCandidacyTable,
  milestone as milestoneTable,
  protocol as protocolTable,
} from "@/db/schema";
import {
  computarRepertorio,
  computarSegmentacao,
  type Observacao,
  type TipoEstrutura,
} from "./segmentacao";

export type EvidenciaObservada = {
  sessionNumero: number;
  goalId: string | null;
  milestoneId: string | null;
  protocolId: string | null;
  /** string crua de nivel_ajuda (classificação ATUAL — evidence_current). */
  nivelAjuda: string | null;
  polaridade: "positiva" | "negativa" | null;
  /** true se há EvidenceQuery aberta apontando para esta evidência (V1e). */
  temQueryAberta: boolean;
};

export type CriterioDominio = { tipo: string; valor: number } & Record<string, unknown>;

/** Interface mínima de consulta — implementável sobre uma tx Drizzle
 * (RLS aplicado, mesmo padrão de `resolver.ts`). */
export type MaterializarQueries = {
  /** Toda a história de evidence_current do paciente (não invalidada),
   * ordenada por session_numero — a segmentação precisa do histórico
   * completo para reconstruir o estado, mesmo quando só recomputamos a
   * partir de `desdeNumero` na escrita. */
  evidenciasDoPaciente(patientId: string): Promise<EvidenciaObservada[]>;
  /** protocol.taxonomia_ajuda (array ordenado; ordinal = índice). */
  taxonomiaDoProtocolo(protocolId: string): Promise<string[]>;
  /** milestone.tipo_estrutura, por id (null se marco não existir). */
  tipoEstruturaDoMarco(milestoneId: string): Promise<TipoEstrutura | null>;
  /** goal.criterio_dominio, por id. */
  criterioDominioDaMeta(goalId: string): Promise<CriterioDominio | null>;
  /** Estado ATUAL de goal_candidacy (para preservar `candidacy_since` quando o
   * goal já era candidato — não reiniciar a contagem de "há quanto tempo" a
   * cada recompute). */
  lerCandidaturaGoalAtual(
    goalId: string,
  ): Promise<{ isCandidate: boolean; candidacySince: Date | null } | null>;
  /** Upsert privilegiado (app_aplicar_snapshot). */
  aplicarSnapshot(input: {
    patientId: string;
    sessionNumero: number;
    repertorio: Record<string, unknown>;
    segmentacao: Record<string, unknown>;
  }): Promise<void>;
  /** Upsert privilegiado (app_aplicar_candidatura) — só o eixo goal por ora. */
  aplicarCandidaturaGoal(input: {
    patientId: string;
    goalId: string;
    isCandidate: boolean;
    candidacySince: Date | null;
  }): Promise<void>;
};

/** Adapter sobre uma transação Drizzle (`withTenant`, RLS aplicado). */
export function drizzleMaterializarQueries(tx: any): MaterializarQueries {
  return {
    async evidenciasDoPaciente(patientId) {
      const rows = await tx.execute(sqlEvidenciaPaciente(patientId));
      return (rows as any[]).map((r) => rowParaObservacao(r));
    },
    async taxonomiaDoProtocolo(protocolId) {
      const [row] = await tx
        .select({ taxonomiaAjuda: protocolTable.taxonomiaAjuda })
        .from(protocolTable)
        .where(eq(protocolTable.id, protocolId));
      const arr = row?.taxonomiaAjuda;
      return Array.isArray(arr) ? (arr as string[]) : [];
    },
    async tipoEstruturaDoMarco(milestoneId) {
      const [row] = await tx
        .select({ tipoEstrutura: milestoneTable.tipoEstrutura })
        .from(milestoneTable)
        .where(eq(milestoneTable.id, milestoneId));
      return (row?.tipoEstrutura as TipoEstrutura | undefined) ?? null;
    },
    async criterioDominioDaMeta(goalId) {
      const [row] = await tx
        .select({ criterioDominio: goalTable.criterioDominio })
        .from(goalTable)
        .where(eq(goalTable.id, goalId));
      return (row?.criterioDominio as CriterioDominio | undefined) ?? null;
    },
    async lerCandidaturaGoalAtual(goalId) {
      const [row] = await tx
        .select({
          isCandidate: goalCandidacyTable.isCandidateDominada,
          candidacySince: goalCandidacyTable.candidacySince,
        })
        .from(goalCandidacyTable)
        .where(eq(goalCandidacyTable.goalId, goalId));
      if (!row) return null;
      return { isCandidate: row.isCandidate, candidacySince: row.candidacySince ?? null };
    },
    async aplicarSnapshot({ patientId, sessionNumero, repertorio, segmentacao }) {
      await tx.execute(
        sqlAplicarSnapshot(patientId, sessionNumero, repertorio, segmentacao),
      );
    },
    async aplicarCandidaturaGoal({ patientId, goalId, isCandidate, candidacySince }) {
      await tx.execute(
        sqlAplicarCandidatura(patientId, null, goalId, isCandidate, candidacySince),
      );
    },
  };
}

/** Adapter sobre uma conexão `postgres.Sql` crua (owner/backfill — bypassa RLS,
 * exige `clinicId`/filtros explícitos; usado por scripts administrativos). */
export function postgresMaterializarQueries(sql: postgres.Sql): MaterializarQueries {
  return {
    async evidenciasDoPaciente(patientId) {
      const rows = await sql`
        SELECT ec.session_numero, ec.goal_id, ec.milestone_id, ec.protocol_id,
               ec.classificacao_atual,
               EXISTS (
                 SELECT 1 FROM evidence_query eq
                 WHERE eq.evidence_id = ec.id AND eq.respondido_em IS NULL
               ) AS tem_query_aberta
        FROM evidence_current ec
        WHERE ec.patient_id = ${patientId} AND ec.invalidada = false
        ORDER BY ec.session_numero ASC
      `;
      return rows.map((r) => rowParaObservacao(r));
    },
    async taxonomiaDoProtocolo(protocolId) {
      const [row] = await sql`SELECT taxonomia_ajuda FROM protocol WHERE id = ${protocolId}`;
      const arr = row?.taxonomia_ajuda;
      return Array.isArray(arr) ? (arr as string[]) : [];
    },
    async tipoEstruturaDoMarco(milestoneId) {
      const [row] = await sql`SELECT tipo_estrutura FROM milestone WHERE id = ${milestoneId}`;
      return (row?.tipo_estrutura as TipoEstrutura | undefined) ?? null;
    },
    async criterioDominioDaMeta(goalId) {
      const [row] = await sql`SELECT criterio_dominio FROM goal WHERE id = ${goalId}`;
      return (row?.criterio_dominio as CriterioDominio | undefined) ?? null;
    },
    async lerCandidaturaGoalAtual(goalId) {
      const [row] = await sql`
        SELECT is_candidate_dominada, candidacy_since FROM goal_candidacy WHERE goal_id = ${goalId}
      `;
      if (!row) return null;
      return {
        isCandidate: Boolean(row.is_candidate_dominada),
        candidacySince: row.candidacy_since ?? null,
      };
    },
    async aplicarSnapshot({ patientId, sessionNumero, repertorio, segmentacao }) {
      await sql`SELECT app_aplicar_snapshot(${patientId}, ${sessionNumero}, ${sql.json(repertorio as never)}, ${sql.json(segmentacao as never)})`;
    },
    async aplicarCandidaturaGoal({ patientId, goalId, isCandidate, candidacySince }) {
      await sql`SELECT app_aplicar_candidatura(${patientId}, NULL, ${goalId}, ${isCandidate}, ${candidacySince ? candidacySince.toISOString() : null}, NULL, NULL)`;
    },
  };
}

function rowParaObservacao(r: any): EvidenciaObservada {
  const classificacao = r.classificacaoAtual ?? r.classificacao_atual ?? {};
  const nivelAjuda: string | null =
    typeof classificacao?.nivel_ajuda === "string" ? classificacao.nivel_ajuda : null;
  const polaridadeRaw = classificacao?.polaridade;
  const polaridade: "positiva" | "negativa" | null =
    polaridadeRaw === "positiva" || polaridadeRaw === "negativa" ? polaridadeRaw : null;
  return {
    sessionNumero: Number(r.sessionNumero ?? r.session_numero),
    goalId: (r.goalId ?? r.goal_id) ?? null,
    milestoneId: (r.milestoneId ?? r.milestone_id) ?? null,
    protocolId: (r.protocolId ?? r.protocol_id) ?? null,
    nivelAjuda,
    polaridade,
    temQueryAberta: Boolean(r.temQueryAberta ?? r.tem_query_aberta),
  };
}

// Fallback interno (drizzle sql`` helpers) — mantido próximo dos adapters para
// não duplicar a query entre os dois drivers.
function sqlEvidenciaPaciente(patientId: string) {
  return dsql`
    SELECT ec.session_numero AS session_numero, ec.goal_id AS goal_id,
           ec.milestone_id AS milestone_id, ec.protocol_id AS protocol_id,
           ec.classificacao_atual AS classificacao_atual,
           EXISTS (
             SELECT 1 FROM evidence_query eq
             WHERE eq.evidence_id = ec.id AND eq.respondido_em IS NULL
           ) AS tem_query_aberta
    FROM evidence_current ec
    WHERE ec.patient_id = ${patientId} AND ec.invalidada = false
    ORDER BY ec.session_numero ASC
  `;
}
function sqlAplicarSnapshot(
  patientId: string,
  sessionNumero: number,
  repertorio: unknown,
  segmentacao: unknown,
) {
  return dsql`SELECT app_aplicar_snapshot(${patientId}, ${sessionNumero}, ${JSON.stringify(repertorio)}::jsonb, ${JSON.stringify(segmentacao)}::jsonb)`;
}
function sqlAplicarCandidatura(
  patientId: string,
  milestoneId: string | null,
  goalId: string | null,
  isCandidate: boolean,
  candidacySince: Date | null,
) {
  return dsql`SELECT app_aplicar_candidatura(${patientId}, ${milestoneId}, ${goalId}, ${isCandidate}, ${candidacySince ? candidacySince.toISOString() : null}, NULL, NULL)`;
}

/**
 * Avalia `Goal.criterio_dominio` contra o histórico de observações
 * (excluindo query aberta), na ordem de `session_numero`. Suporta, por ora,
 * `sessoes_consecutivas_independente` (modelo-de-dados §2.4, exemplo real:
 * `{"tipo":"sessoes_consecutivas_independente","valor":3}`) — as últimas N
 * evidências do goal (por `session_numero`, distintas) são POSITIVAS e no
 * nível mais independente (ordinal 0) do respectivo protocolo, sem
 * interrupção por negativa. Outros tipos de critério: retorna `false` (não
 * acende candidatura por falta de evaluator — melhor não acender do que
 * acender errado).
 */
export function avaliarCandidaturaGoal(
  criterio: CriterioDominio | null,
  observacoesOrdenadas: Observacao[],
): boolean {
  if (!criterio) return false;
  if (criterio.tipo !== "sessoes_consecutivas_independente") return false;
  const n = Number(criterio.valor);
  if (!Number.isFinite(n) || n <= 0) return false;

  const validas = observacoesOrdenadas
    .filter((o) => !o.temQueryAberta)
    .sort((a, b) => a.sessionNumero - b.sessionNumero);
  if (validas.length < n) return false;

  const ultimasN = validas.slice(-n);
  return ultimasN.every(
    (o) => o.polaridade === "positiva" && o.nivelAjudaOrdinal === 0,
  );
}

/**
 * Materializa `session_snapshot` (+ recomputa `goal_candidacy`) do paciente,
 * a partir de TODA a história de evidence (necessária para reconstruir o
 * estado da segmentação), escrevendo só as linhas de `session_numero >=
 * desdeNumero` (recompute retroativo mínimo — spec §4). `milestone_candidacy`
 * fica FORA por ora (ver TODO no cabeçalho do arquivo).
 */
export async function materializarSnapshot(
  queries: MaterializarQueries,
  patientId: string,
  desdeNumero: number,
): Promise<void> {
  const evidencias = await queries.evidenciasDoPaciente(patientId);
  if (evidencias.length === 0) return;

  // Cache de taxonomia por protocolo (ordinal = índice no array).
  const protocolIds = [...new Set(evidencias.map((e) => e.protocolId).filter((x): x is string => !!x))];
  const taxonomiaPorProtocolo = new Map<string, string[]>();
  for (const pid of protocolIds) {
    taxonomiaPorProtocolo.set(pid, await queries.taxonomiaDoProtocolo(pid));
  }

  // Cache de tipo_estrutura por milestone.
  const milestoneIds = [...new Set(evidencias.map((e) => e.milestoneId).filter((x): x is string => !!x))];
  const tipoEstruturaPorMilestone = new Map<string, TipoEstrutura | null>();
  for (const mid of milestoneIds) {
    tipoEstruturaPorMilestone.set(mid, await queries.tipoEstruturaDoMarco(mid));
  }

  function ordinalDe(protocolId: string | null, nivelAjuda: string | null): number | null {
    if (!protocolId || !nivelAjuda) return null;
    const taxonomia = taxonomiaPorProtocolo.get(protocolId) ?? [];
    const idx = taxonomia.indexOf(nivelAjuda);
    return idx >= 0 ? idx : null;
  }

  function tipoEstruturaDe(e: EvidenciaObservada): TipoEstrutura {
    if (e.milestoneId) {
      return tipoEstruturaPorMilestone.get(e.milestoneId) ?? "marco_simples";
    }
    // Julgamento (achado de escopo — §2 da spec): sem marco resolvido, o
    // dado é lido no eixo de ajuda em grão de GOAL, que a spec cobre como
    // marco_simples-equivalente.
    return "marco_simples";
  }

  // ── Streams por (goal_id, protocol_id) — nunca cruza protocolos ──
  const streamsPorGoalProtocolo = new Map<string, Observacao[]>();
  // ── Streams por goal (todos os protocolos juntos) — só para repertório ──
  const streamsPorGoal = new Map<string, Observacao[]>();

  for (const e of evidencias) {
    if (!e.goalId) continue; // sem grão de meta — fora do escopo (achado #3)
    const obs: Observacao = {
      sessionNumero: e.sessionNumero,
      tipoEstrutura: tipoEstruturaDe(e),
      nivelAjudaOrdinal: ordinalDe(e.protocolId, e.nivelAjuda),
      polaridade: e.polaridade ?? "positiva",
      temQueryAberta: e.temQueryAberta,
    };
    const chaveGoalProtocolo = `${e.goalId}::${e.protocolId ?? "sem_protocolo"}`;
    if (!streamsPorGoalProtocolo.has(chaveGoalProtocolo)) streamsPorGoalProtocolo.set(chaveGoalProtocolo, []);
    streamsPorGoalProtocolo.get(chaveGoalProtocolo)!.push(obs);

    if (!streamsPorGoal.has(e.goalId)) streamsPorGoal.set(e.goalId, []);
    streamsPorGoal.get(e.goalId)!.push(obs);
  }

  // segmentacaoPorGoalProtocolo[goalId][protocolId] = ResultadoSessao[]
  const segmentacaoResultados = new Map<string, ReturnType<typeof computarSegmentacao>>();
  for (const [chave, obs] of streamsPorGoalProtocolo) {
    segmentacaoResultados.set(chave, computarSegmentacao(obs));
  }

  const repertorioPorGoal = computarRepertorio(Object.fromEntries(streamsPorGoal));

  // Números de sessão a materializar: todos os que aparecem em QUALQUER
  // evidência do paciente (achado #1 — ver cabeçalho), filtrados por >= desde.
  const todosOsNumeros = [...new Set(evidencias.map((e) => e.sessionNumero))].sort((a, b) => a - b);
  const numerosAMaterializar = todosOsNumeros.filter((n) => n >= desdeNumero);

  for (const numero of numerosAMaterializar) {
    // segmentacao = { goal_id: { protocol_id: { tipo_estrutura, metrica, rotulo } } }
    const segmentacao: Record<string, Record<string, unknown>> = {};
    for (const [chave, resultados] of segmentacaoResultados) {
      const [goalId, protocolId] = chave.split("::");
      // Última observação com sessionNumero <= numero (estado corrente naquele ponto).
      const ultimaAteAqui = [...resultados].reverse().find((r) => r.sessionNumero <= numero);
      if (!ultimaAteAqui) continue;
      segmentacao[goalId!] ??= {};
      segmentacao[goalId!]![protocolId!] = {
        tipo_estrutura: ultimaAteAqui.tipoEstrutura,
        metrica: ultimaAteAqui.metrica,
        rotulo: ultimaAteAqui.rotulo,
      };
    }

    // repertorio_state = { goal_id: { nivel_ajuda_recente, contagem, is_candidata } }
    const repertorio: Record<string, unknown> = {};
    for (const [goalId, streamCompleto] of streamsPorGoal) {
      const ateAqui = streamCompleto.filter((o) => o.sessionNumero <= numero);
      const parcial = computarRepertorio({ [goalId]: ateAqui })[goalId]!;
      repertorio[goalId] = {
        nivel_ajuda_recente: parcial.nivelAjudaRecente,
        contagem: parcial.contagem,
        is_candidata: parcial.isCandidata,
      };
    }

    await queries.aplicarSnapshot({ patientId, sessionNumero: numero, repertorio, segmentacao });
  }

  // ── goal_candidacy: avalia Goal.criterio_dominio contra o histórico completo ──
  for (const [goalId, streamCompleto] of streamsPorGoal) {
    const criterio = await queries.criterioDominioDaMeta(goalId);
    const isCandidate = avaliarCandidaturaGoal(criterio, streamCompleto);
    const atual = await queries.lerCandidaturaGoalAtual(goalId);
    // Preserva `candidacy_since` se já era candidato (não reinicia a
    // contagem de "há quanto tempo é candidato" a cada recompute); só marca
    // a data quando a transição é false→true agora.
    const candidacySince = isCandidate
      ? (atual?.isCandidate ? atual.candidacySince : new Date())
      : null;
    await queries.aplicarCandidaturaGoal({ patientId, goalId, isCandidate, candidacySince });
  }

  // TODO(4B — milestone_candidacy): critério por Milestone/família ainda não
  // modelado (ver julgamento #4 no cabeçalho). Deixado deliberadamente de fora
  // até o modelo de dados definir o critério (N evidências independentes
  // positivas em M sessões distintas, por Milestone, excluindo famílias
  // PROC/observação) — não escrever candidatura de marco chutando parâmetros.
}
