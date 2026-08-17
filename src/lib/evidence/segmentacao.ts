/**
 * Segmentação de evidência (Fase 4 · 4B) — módulo PURO, sem DB.
 *
 * Fonte: docs/superpowers/specs/2026-07-13-fase-4-compute-segmentacao.md, §3.
 * Escopo travado nesta tarefa (decisão (1) da spec): a segmentação SÓ cobre o
 * eixo de nível-de-ajuda, computável a partir de `evidence` (nivel_ajuda +
 * protocol.taxonomia_ajuda). Isso vale para `marco_simples` (e para `goal`,
 * que não tem tipo_estrutura próprio — herda o eixo de ajuda do protocolo).
 * `marco_com_barreira` / `escore_composto` / `faixa_normativa` dependem de
 * `MilestoneAssessment` (avaliação formal, Fase 5) — NUNCA fabricamos um
 * número aqui; o rótulo é sempre `aguardando_avaliacao_formal`.
 *
 * IMPORTANTE (correção 09/07/2026, modelo-de-dados §2.5): `nivel_ajuda` não
 * tem escala ordinal global — o ordinal SÓ é comparável dentro do MESMO
 * protocolo. Este módulo nunca recebe streams multi-protocolo: o chamador
 * (materializar.ts) já particiona as observações por `(goal_id, protocol_id)`
 * antes de invocar `computarSegmentacao`. Cada chamada = 1 protocolo.
 */

export type TipoEstrutura =
  | "marco_simples"
  | "marco_com_barreira"
  | "escore_composto"
  | "faixa_normativa";

type Polaridade = "positiva" | "negativa";

/**
 * Uma observação de sessão dentro do stream de UM (goal_id, protocol_id).
 * `nivelAjudaOrdinal` já veio resolvido via `protocol.taxonomia_ajuda[nivel_ajuda]`
 * — este módulo nunca olha para a string crua de nível de ajuda.
 */
export type Observacao = {
  sessionNumero: number;
  tipoEstrutura: TipoEstrutura;
  nivelAjudaOrdinal: number | null;
  polaridade: Polaridade;
  /** V1e: evidência com EvidenceQuery aberta não conta na segmentação. */
  temQueryAberta: boolean;
};

type Rotulo =
  | "evolucao"
  | "estagnacao"
  | "regressao"
  | "aguardando_avaliacao_formal"
  | "sem_dado";

type Metrica = {
  eixo: "nivel_ajuda";
  ordinalRecente: number | null;
};

export type ResultadoSessao = {
  sessionNumero: number;
  tipoEstrutura: TipoEstrutura;
  metrica: Metrica | null;
  rotulo: Rotulo;
};

export type OpcoesSegmentacao = {
  /** Janela deslizante (nº de sessões tocando o goal, sem evolução/regressão)
   * para disparar ESTAGNAÇÃO. Default 5 (spec §3). */
  janelaEstagnacao?: number;
};

/**
 * Computa a segmentação de UM stream (goal_id, protocol_id), em ordem de
 * `sessionNumero` (o chamador garante ordenação; aqui só ordenamos
 * defensivamente para não depender disso silenciosamente).
 *
 * Observações com `temQueryAberta=true` são EXCLUÍDAS do cálculo (V1e) — não
 * aparecem no resultado e não alteram o estado (nenhuma sessão "conta").
 *
 * JULGAMENTO CLÍNICO (flag para tech lead — ver relatório):
 *  - EVOLUÇÃO compara o ordinal atual contra o MELHOR (menor) ordinal já
 *    atingido nesse protocolo (não só o da sessão anterior) — assim uma
 *    oscilação que volta ao patamar já dominado não conta como evolução de
 *    novo, só ordinal ABAIXO do melhor histórico conta.
 *  - REGRESSÃO por "piora sustentada" exige 2 pioras CONSECUTIVAS entre
 *    observações adjacentes (ordinal(n) > ordinal(n-1) duas vezes seguidas),
 *    não 2 sessões piores que o melhor histórico.
 *  - ESTAGNAÇÃO só é emitida quando a janela (default 5) de sessões SEM
 *    evolução/regressão é atingida; antes disso o rótulo é `sem_dado` (a
 *    spec não deixa explícito o rótulo intermediário — optei por não
 *    fabricar "estagnação" prematura).
 *  - Observação sem `nivelAjudaOrdinal` (nível de ajuda não informado nessa
 *    evidência) conta para a janela de estagnação (ausência de progresso),
 *    mas não pode disparar evolução/regressão (não há métrica).
 */
export function computarSegmentacao(
  observacoes: Observacao[],
  opcoes: OpcoesSegmentacao = {},
): ResultadoSessao[] {
  const janela = opcoes.janelaEstagnacao ?? 5;
  const ordenadas = [...observacoes]
    .filter((o) => !o.temQueryAberta)
    .sort((a, b) => a.sessionNumero - b.sessionNumero);

  const resultado: ResultadoSessao[] = [];

  // Estado do stream (só usado para marco_simples — os demais tipos não
  // acumulam estado nenhum, cada observação é independente e sempre
  // `aguardando_avaliacao_formal`).
  let bestOrdinal: number | null = null;
  let prevOrdinal: number | null = null;
  let worseStreak = 0;
  let sawPositive = false;
  let sessionsSinceImprovement = 0;

  for (const obs of ordenadas) {
    if (obs.tipoEstrutura !== "marco_simples") {
      // Achado de escopo (spec §2): sem dado formal de barreira/composto/
      // normativo no fluxo de sessão — nunca fabricar número.
      resultado.push({
        sessionNumero: obs.sessionNumero,
        tipoEstrutura: obs.tipoEstrutura,
        metrica: null,
        rotulo: "aguardando_avaliacao_formal",
      });
      continue;
    }

    if (obs.nivelAjudaOrdinal == null) {
      sessionsSinceImprovement += 1;
      const rotulo: Rotulo =
        sessionsSinceImprovement >= janela ? "estagnacao" : "sem_dado";
      resultado.push({
        sessionNumero: obs.sessionNumero,
        tipoEstrutura: obs.tipoEstrutura,
        metrica: { eixo: "nivel_ajuda", ordinalRecente: null },
        rotulo,
      });
      continue;
    }

    const ordinal = obs.nivelAjudaOrdinal;
    const worsenedVsPrev = prevOrdinal !== null && ordinal > prevOrdinal;
    worseStreak = worsenedVsPrev ? worseStreak + 1 : 0;

    const isFirstPositive = obs.polaridade === "positiva" && !sawPositive;
    const isImprovement = bestOrdinal !== null && ordinal < bestOrdinal;
    const wasIndependent = bestOrdinal === 0;
    const negativeOnIndependent =
      obs.polaridade === "negativa" && wasIndependent;
    const sustainedRegression = worseStreak >= 2;

    let rotulo: Rotulo;
    if (isFirstPositive || isImprovement) {
      rotulo = "evolucao";
      bestOrdinal =
        bestOrdinal === null ? ordinal : Math.min(bestOrdinal, ordinal);
      sessionsSinceImprovement = 0;
      worseStreak = 0;
    } else if (negativeOnIndependent || sustainedRegression) {
      rotulo = "regressao";
      sessionsSinceImprovement = 0;
    } else {
      sessionsSinceImprovement += 1;
      rotulo = sessionsSinceImprovement >= janela ? "estagnacao" : "sem_dado";
    }

    if (obs.polaridade === "positiva") sawPositive = true;
    prevOrdinal = ordinal;

    resultado.push({
      sessionNumero: obs.sessionNumero,
      tipoEstrutura: obs.tipoEstrutura,
      metrica: { eixo: "nivel_ajuda", ordinalRecente: ordinal },
      rotulo,
    });
  }

  return resultado;
}

export type RepertorioEntry = {
  /** Só numérico/enum — nunca texto livre nem narrativa (LGPD G6b). */
  nivelAjudaRecente: number | null;
  contagem: number;
  /**
   * Placeholder informativo (NÃO é a escrita oficial de candidatura — essa
   * vive em `milestone_candidacy`/`goal_candidacy`, avaliada em
   * materializar.ts contra `Goal.criterio_dominio` / critério de Milestone).
   * Aqui só sinaliza "há evidência suficiente para considerar candidatura",
   * um heurístico simples e explicitamente documentado como tal — flag para
   * o tech lead: se a UI vier a consumir este campo diretamente, validar se
   * o heurístico (>= 3 evidências computadas) é aceitável ou se deve ficar
   * sempre `false` até a candidatura oficial acender.
   */
  isCandidata: boolean;
};

export type OpcoesRepertorio = {
  /** Contagem mínima de observações computadas para o placeholder `isCandidata`. */
  candidaturaMinContagem?: number;
};

/**
 * Computa o `repertorio_state` (por goal/milestone) a partir dos streams já
 * particionados por id (goal_id OU milestone_id — grão que o chamador
 * decidir). Cada stream deve já vir isolado por protocolo se a chave
 * misturar protocolos diferentes (o chamador é responsável por isso — este
 * módulo não tenta detectar cruzamento indevido de protocolos, só assume
 * que cada valor do record já é um stream mono-protocolo, ou agrega o
 * "nível mais recente" olhando somente a última observação, seja qual for
 * o protocolo dela).
 */
export function computarRepertorio(
  streams: Record<string, Observacao[]>,
  opcoes: OpcoesRepertorio = {},
): Record<string, RepertorioEntry> {
  const minContagem = opcoes.candidaturaMinContagem ?? 3;
  const saida: Record<string, RepertorioEntry> = {};

  for (const [id, obsRaw] of Object.entries(streams)) {
    const obs = [...obsRaw]
      .filter((o) => !o.temQueryAberta)
      .sort((a, b) => a.sessionNumero - b.sessionNumero);

    const contagem = obs.length;
    let nivelAjudaRecente: number | null = null;
    for (let i = obs.length - 1; i >= 0; i--) {
      const o = obs[i]!;
      if (o.tipoEstrutura === "marco_simples" && o.nivelAjudaOrdinal != null) {
        nivelAjudaRecente = o.nivelAjudaOrdinal;
        break;
      }
    }

    saida[id] = {
      nivelAjudaRecente,
      contagem,
      isCandidata: contagem >= minContagem,
    };
  }

  return saida;
}
