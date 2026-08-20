/**
 * Helper único de rótulo para timeline (ANAM-14).
 *
 * Um único lugar sabe que o ponto 0 se chama "Anamnese".
 * Sem `"use client"`: importável por server e client.
 *
 * Resolve as 13 ocorrências de `Sessão {n}` nos arquivos:
 * - scrubber.tsx:110,130,173,174
 * - timeline-client.tsx:505,507,543,717,734,769,771,783,853
 * - grafico-espectro.tsx:152,277,284,299,355
 *
 * Padrão: as frases do repo não são só `Sessão {n}` — são:
 * - `Sessão {n}` isolado
 * - `Visualizando histórico passado: Sessão {n}`
 * - `Início (Sessão {n})`
 * - `até a Sessão {n}`
 * - `desde a Sessão {n}`
 * - `Linha tracejada: Sessão {n}`
 *
 * Um `if` por sítio é 13 chances de escrever "Sessão 0".
 * As quatro funções cobrem as seis formas, e teste unitário de tabela
 * prova as duas colunas (`n = 0` e `n > 0`) de uma vez.
 */

export const ROTULO_MARCO_ZERO = "Anamnese";

/**
 * Rótulo padrão de um ponto da timeline.
 * @param n Número do ponto (0 = anamnese, > 0 = sessão)
 * @returns "Anamnese" | "Sessão 3"
 */
export function rotuloPonto(n: number): string {
  if (n === 0) {
    return ROTULO_MARCO_ZERO;
  }
  return `Sessão ${n}`;
}

/**
 * Rótulo curto de um ponto (para eixo do gráfico, onde espaço é curto).
 * @param n Número do ponto (0 = anamnese, > 0 = sessão)
 * @returns "Anamnese" | "S3"
 */
export function rotuloPontoCurto(n: number): string {
  if (n === 0) {
    return ROTULO_MARCO_ZERO;
  }
  return `S${n}`;
}

/**
 * Rótulo com preposição "desde".
 * @param n Número do ponto (0 = anamnese, > 0 = sessão)
 * @returns "desde a Anamnese" | "desde a Sessão 3"
 */
export function rotuloDesde(n: number): string {
  if (n === 0) {
    return `desde a ${ROTULO_MARCO_ZERO}`;
  }
  return `desde a Sessão ${n}`;
}

/**
 * Rótulo com preposição "até".
 * @param n Número do ponto (0 = anamnese, > 0 = sessão)
 * @returns "até a Anamnese" | "até a Sessão 3"
 */
export function rotuloAte(n: number): string {
  if (n === 0) {
    return `até a ${ROTULO_MARCO_ZERO}`;
  }
  return `até a Sessão ${n}`;
}
