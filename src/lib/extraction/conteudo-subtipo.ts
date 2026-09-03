/**
 * Leitura tolerante do conteúdo de um subtipo dentro do payload de `extraction`
 * (#532/#533, sequela #553).
 *
 * O payload gravado em `extraction` é o objeto FLAT do subtipo
 * (`LlmExtractionProvider.payloadDoSubtipo` → `e.evidencia`, e o stub demo
 * grava `{alvos, polaridade}`), mas os leitores nasceram lendo a forma
 * ANINHADA `{evidencia: {...}}` dos seeds de teste — em produção `alvos` saía
 * sempre vazio e nenhuma `evidence` nascia na aprovação (achado ao fechar
 * #532). Aceita as duas formas:
 *
 *   - chave do subtipo presente e objeto → aninhado, devolve o objeto interno;
 *   - chave presente e `null` → conteúdo explicitamente ausente, devolve `null`
 *     (NÃO cai para a raiz: um `?? payload` inventaria conteúdo onde ele foi
 *     anulado);
 *   - chave ausente → o próprio payload é o conteúdo (forma flat).
 *
 * ⚠️ FONTE ÚNICA. Vive fora de `revisao/[sessionId]/logic.ts` (que é
 * `server-only`) porque `scripts/backfill-evidence.ts` precisa da MESMA
 * leitura: foi exatamente a cópia divergente entre o leitor on-approve e o
 * backfill que produziu a deriva da #553. Quem ler payload de `extraction`
 * chama daqui — não reimplementa.
 *
 * A forma CANÔNICA do jsonb (flat vs. aninhado, e a migração do que existe)
 * segue em aberto na #553 item (2) — este helper é a ponte enquanto isso, não
 * a decisão.
 */
export function conteudoDoSubtipo(
  payload: unknown,
  subtipo: string,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (subtipo in p) {
    const aninhado = p[subtipo];
    return aninhado && typeof aninhado === "object"
      ? (aninhado as Record<string, unknown>)
      : null;
  }
  return p;
}
