// Fricção de revisão por estado de confiança (fluxos-e-wireframes.md §3).
// Fonte única da regra usada pela action de lote E pela UI de revisão.
export type FriccaoNivel = "baixo" | "medio" | "alto";

export function avaliarFriccao(args: {
  confianca: "alta" | "media" | "baixa";
  inconsistenteComHistorico: boolean;
}): { podeLote: boolean; exigeFriccao: boolean; nivel: FriccaoNivel } {
  // Inconsistência com histórico é o cenário de maior risco de erro silencioso
  // (regressão real vs. erro de extração) — vence a confiança, nunca vai a lote.
  if (args.inconsistenteComHistorico) {
    return { podeLote: false, exigeFriccao: true, nivel: "alto" };
  }
  if (args.confianca === "alta") {
    return { podeLote: true, exigeFriccao: false, nivel: "baixo" };
  }
  // media/baixa: sem lote, fricção deliberada (abrir + confirmar antes de aprovar).
  return { podeLote: false, exigeFriccao: true, nivel: "medio" };
}
