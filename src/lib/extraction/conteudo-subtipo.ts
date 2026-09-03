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
 * ─── FORMA CANÔNICA: **FLAT** (#553 item 2 — RATIFICADA pelo Rômulo em
 * 03/09/2026, sobre medição, não sobre leitura de código).
 *
 * Escritores de `extraction.payload`, todos flat: `payloadDoSubtipo`
 * (`llm-provider.ts`), `DemoStubProvider`, `NullProvider` e o seed de demo
 * (`scripts/seed-demo-account.ts`). Não existe escritor aninhado, e nunca
 * existiu: antes da D57 (`7886e8f4`) produção rodava `NullProvider` — o `.env`
 * não tinha chave de LLM, então a flag não tinha efeito.
 *
 * Medição em produção (psql como owner, 03/09/2026):
 *   `SELECT (payload ? 'evidencia'), count(*) FROM extraction
 *      WHERE subtipo='evidencia' GROUP BY 1;` → **f: 310** (zero aninhadas).
 * Não há dado a migrar. O aninhado só existia em fixture de int-test — e foi
 * exatamente essa fixture que escondeu a deriva.
 *
 * ⚠️ O contrato de SAÍDA DO AGENTE (`docs/agente/output-schema.json`) continua
 * ANINHADO (`{tipo, evidencia: {…}}`) e não muda: são camadas distintas.
 * `payloadDoSubtipo` é a fronteira que desembrulha uma na outra. Trocar a forma
 * da coluna não é mexer no schema do agente.
 *
 * Este helper permanece tolerante de propósito: fixtures antigas e qualquer
 * payload aninhado que apareça continuam lidos corretamente. Tolerância na
 * leitura, forma única na escrita.
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
