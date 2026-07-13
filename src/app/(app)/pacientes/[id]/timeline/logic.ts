export interface RepertorioItem {
  nivel_ajuda_recente: number | null;
  contagem: number;
  is_candidata?: boolean;
}

export type RepertorioState = Record<string, RepertorioItem>;

export interface DeltaItem {
  id: string;
  tipo: "novo" | "evolucao" | "regressao" | "estavel";
  nivelAnterior: number | null;
  nivelNovo: number | null;
  contagemDelta: number;
  virouCandidata: boolean;
}

export interface DeltaSessao {
  itens: DeltaItem[];
  evidenciasNovas: number;
  metasCandidatasNovas: number;
}

/**
 * Calcula a diferença (delta) de repertório entre dois snapshots.
 * snapA é o snapshot anterior (passado), snapB é o snapshot novo (presente).
 */
export function calcularDelta(
  snapA: RepertorioState | null,
  snapB: RepertorioState | null
): DeltaSessao {
  const itens: DeltaItem[] = [];
  let evidenciasNovas = 0;
  let metasCandidatasNovas = 0;

  const stateA = snapA || {};
  const stateB = snapB || {};

  const todasChaves = new Set([...Object.keys(stateA), ...Object.keys(stateB)]);

  for (const id of todasChaves) {
    const itemA = stateA[id];
    const itemB = stateB[id];

    if (!itemA && itemB) {
      // Item novo (não existia no snapshot anterior)
      const virouCandidata = !!itemB.is_candidata;
      if (virouCandidata) metasCandidatasNovas += 1;
      evidenciasNovas += itemB.contagem;

      itens.push({
        id,
        tipo: "novo",
        nivelAnterior: null,
        nivelNovo: itemB.nivel_ajuda_recente ?? null,
        contagemDelta: itemB.contagem,
        virouCandidata,
      });
    } else if (itemA && !itemB) {
      // Item removido/arquivado (existia no anterior mas sumiu no recente)
      const nivelAnterior = itemA.nivel_ajuda_recente ?? null;
      itens.push({
        id,
        tipo: "regressao",
        nivelAnterior,
        nivelNovo: null,
        contagemDelta: 0,
        virouCandidata: false,
      });
    } else if (itemA && itemB) {
      // Item já existia, compara alterações
      const contagemDelta = Math.max(0, itemB.contagem - itemA.contagem);
      evidenciasNovas += contagemDelta;

      const virouCandidata = !!itemB.is_candidata && !itemA.is_candidata;
      if (virouCandidata) metasCandidatasNovas += 1;

      let tipo: "novo" | "evolucao" | "regressao" | "estavel" = "estavel";
      const nivelAnterior = itemA.nivel_ajuda_recente ?? null;
      const nivelNovo = itemB.nivel_ajuda_recente ?? null;

      if (nivelAnterior !== nivelNovo) {
        if (nivelAnterior !== null && nivelNovo !== null) {
          // Menor ordinal = melhor (evolução)
          tipo = nivelNovo < nivelAnterior ? "evolucao" : "regressao";
        } else if (nivelAnterior === null && nivelNovo !== null) {
          // Primeiro acerto/registro do marco com nível de ajuda
          tipo = "evolucao";
        } else if (nivelAnterior !== null && nivelNovo === null) {
          // Voltou a não ter nível (regressão)
          tipo = "regressao";
        }
      }

      // Se houve alteração ou mais evidências, adiciona ao delta
      if (tipo !== "estavel" || contagemDelta > 0 || virouCandidata) {
        itens.push({
          id,
          tipo,
          nivelAnterior,
          nivelNovo,
          contagemDelta,
          virouCandidata,
        });
      }
    }
  }

  return {
    itens,
    evidenciasNovas,
    metasCandidatasNovas,
  };
}

/**
 * Verifica se os protocolos mudaram entre a sessão A e a sessão B (Guard G7).
 * Recebe o objeto segmentacao JSONB dos snapshots.
 * O segmentacao é formatado como: { goal_id: { protocol_id: { tipo_estrutura, ... } } }
 */
export function verificarProtocoloMudou(
  segA: Record<string, Record<string, any>> | null,
  segB: Record<string, Record<string, any>> | null
): boolean {
  const safeA = segA || {};
  const safeB = segB || {};

  // Coleta os IDs de protocolo presentes em A e B
  const protocolosA = new Set<string>();
  const protocolosB = new Set<string>();

  for (const goalsMap of Object.values(safeA)) {
    for (const protocolId of Object.keys(goalsMap)) {
      protocolosA.add(protocolId);
    }
  }

  for (const goalsMap of Object.values(safeB)) {
    for (const protocolId of Object.keys(goalsMap)) {
      protocolosB.add(protocolId);
    }
  }

  // Se o conjunto de protocolos ativos não for idêntico, houve mudança de protocolo (G7)
  if (protocolosA.size !== protocolosB.size) return true;
  for (const p of protocolosA) {
    if (!protocolosB.has(p)) return true;
  }

  return false;
}
