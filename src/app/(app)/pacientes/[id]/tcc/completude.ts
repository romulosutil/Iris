// #389 — completude do RPD é derivada em leitura, nunca coluna gravada
// (memória `carimbo-de-estado-nao-limpo-na-volta`: estado carimbado que não
// é limpo na volta atrás mente). Editar um registro para remover evidência
// rebaixa o estado e ele sai do gráfico — comportamento intencional.

export type CompletudeRPD = "registro_capturado" | "reestruturacao_completa";

export interface RPDParaCompletude {
  evidenciasFavor?: string | null;
  evidenciasContra?: string | null;
  respostaRacional?: string | null;
  intensidadePos?: number | null;
}

/**
 * "Reestruturação completa": ao menos uma evidência (a favor OU contra) E
 * pensamento alternativo (`respostaRacional`) E intensidade reavaliada.
 * Distorção cognitiva NUNCA entra neste cálculo — é opcional por design.
 */
export function calcularCompletudeRPD(entry: RPDParaCompletude): CompletudeRPD {
  const temEvidencia = Boolean(
    entry.evidenciasFavor?.trim() || entry.evidenciasContra?.trim(),
  );
  const temAlternativa = Boolean(entry.respostaRacional?.trim());
  const temReavaliacao =
    entry.intensidadePos !== null && entry.intensidadePos !== undefined;

  return temEvidencia && temAlternativa && temReavaliacao
    ? "reestruturacao_completa"
    : "registro_capturado";
}
