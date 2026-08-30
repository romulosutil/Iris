import "server-only";

/**
 * Feature flags do produto. Primeiro flag do repo (T13, #72) — este arquivo
 * estabelece o padrão para os que vierem depois.
 *
 * Formato: função, não const. Uma const capturaria `process.env` no momento
 * do import (build/bundling do Next), congelando o valor lido antes do
 * runtime terminar de carregar as envs do processo. Função relê a cada
 * chamada — mesmo padrão de leitura "on demand" que
 * `src/lib/risco/notificacao.ts` usa para `EMAIL_PROVIDER_API_KEY`.
 */

/**
 * Ditado de voz (ASR self-hosted, #72) — trava de MATURIDADE do serviço
 * faster-whisper (infra/asr/), não gate de LGPD/DPA (D5 do context.md do
 * issue #72: ASR roda na própria VPS, sem transferência internacional).
 *
 * Fail-closed: ausente OU qualquer valor diferente da string exata "true"
 * devolve false (desligado). Só "true" liga.
 */
export function asrHabilitado(): boolean {
  return process.env.FEATURE_FLAG_ASR_ENABLED === "true";
}
