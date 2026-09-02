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

/**
 * Gates de LLM (auditoria 360, A-04). Cada agente de IA do produto tem um
 * gate legal/DPA próprio (D57/D66): sem a flag = "true" o provider real NUNCA
 * é instanciado e nenhum texto de paciente sai para o Google. Antes estavam
 * inline em três providers; aqui viram inventário — `FLAGS_LLM` é a lista
 * que o teste percorre para afirmar o default fail-closed de cada uma.
 *
 * A chave (`GOOGLE_API_KEY`) continua sendo checada no provider: a flag diz
 * "pode ligar", a chave diz "tem como ligar". Os dois juntos ligam.
 */
export function extracaoLlmHabilitada(): boolean {
  return process.env.EXTRACTION_LLM_ENABLED === "true";
}

export function relatorioFamiliaLlmHabilitado(): boolean {
  return process.env.FAMILY_REPORT_LLM_ENABLED === "true";
}

export function relatorioConvenioLlmHabilitado(): boolean {
  return process.env.CONVENIO_REPORT_LLM_ENABLED === "true";
}

/**
 * Inventário de todas as flags do produto: variável de ambiente → leitor.
 * Flag nova entra aqui; `flags.test.ts` percorre a lista e afirma que cada
 * uma devolve `false` com a variável ausente, vazia, "false", "1" e "yes".
 * Um gate que nasça fora deste mapa não tem oráculo de fail-closed.
 */
export const FLAGS = {
  FEATURE_FLAG_ASR_ENABLED: asrHabilitado,
  EXTRACTION_LLM_ENABLED: extracaoLlmHabilitada,
  FAMILY_REPORT_LLM_ENABLED: relatorioFamiliaLlmHabilitado,
  CONVENIO_REPORT_LLM_ENABLED: relatorioConvenioLlmHabilitado,
} as const;

export type FlagEnv = keyof typeof FLAGS;
