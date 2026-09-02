import type { AlertaRiscoAgente } from "./agent-output-schema";

export type ExtractionContext = {
  sessionId: string;
  clinicId: string;
  notaConsolidada: string;
  metasAtivas: Array<{ id: string; descricao: string }>;
  // Contrato canônico montado pelo assembler (protocolos-e-agente.md Parte 2).
  // Opcional: stubs demo/null ignoram; o LlmExtractionProvider real o envia ao LLM.
  contextoCanonico?: unknown;
};

export type ExtractionSubtipo =
  | "evidencia"
  | "registro_abc"
  | "ausencia_comportamento"
  | "cadeia"
  | "preferencia_reforcador"
  // #390 — modos TCC/convencional (enum PG `extraction_subtipo`, migração 0108).
  | "registro_pensamento"
  | "aplicacao_escala_relatada"
  | "tarefa_casa"
  | "pendente"; // sentinela do NullProvider (pendente de reprocessamento)

export type ExtractionDraft = {
  subtipo: ExtractionSubtipo;
  trechoFonte: string;
  confianca: "alta" | "media" | "baixa";
  justificativaConfianca?: string;
  inconsistenteComHistorico: boolean;
  parContrasteId: string | null;
  payload: unknown;
  estado: "sugerida" | "pendente_reprocessamento";
};

/**
 * #122 — o sinal de risco (R20 / R5-TC) viaja SEPARADO das extrações, e não
 * como mais um `ExtractionDraft`.
 *
 * Motivo: extração vai para a fila de validação por exceção do coordenador
 * (V1) e pode ficar dias em `sugerida`. Risco é notificação imediata com prazo
 * — está explicitamente FORA daquela fila. Modelá-lo como draft o faria herdar
 * o ciclo de vida errado, e um risco esperando validação é o oposto do que a
 * spec pede.
 */
/**
 * DA-02 (#535): rastreio da chamada de IA, gravado em `extraction` (colunas
 * `modelo`, `prompt_versao`, `latencia_ms`, `tokens_entrada`, `tokens_saida`).
 * Sem isto "≥70% de aprovação sem edição" (PRODUCT.md) não é mensurável por
 * modelo/prompt, e custo/latência por clínica não existem em lugar nenhum.
 * Tudo nullable: `null` significa "não medido", nunca "zero".
 */
export type ExtractionMeta = {
  /** Id do modelo chamado; `'stub'` na clínica demo; `null` sem modelo. */
  modelo: string | null;
  /** sha256 curto do system prompt usado (`versaoDoPrompt`). */
  promptVersao: string | null;
  /** Tempo de parede de `extrair()` (inclui retry/backoff). */
  latenciaMs: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
};

export const META_SEM_MODELO: ExtractionMeta = {
  modelo: null,
  promptVersao: null,
  latenciaMs: null,
  tokensEntrada: null,
  tokensSaida: null,
};

export type ExtractionResult = {
  drafts: ExtractionDraft[];
  alertaRisco: AlertaRiscoAgente | null;
  /** Opcional só para não obrigar dublês de teste; providers reais preenchem. */
  meta?: ExtractionMeta;
};

export interface ExtractionProvider {
  /** Modelo que o provider chama — para gravar na linha de falha
   * (`pendente_reprocessamento`), quando não há `meta` de sucesso. */
  readonly modelo?: string | null;
  extrair(ctx: ExtractionContext): Promise<ExtractionResult>;
}

import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";
import { LlmExtractionProvider } from "./llm-provider";
import { createGeminiInvoker } from "./gemini-invoker";

/**
 * Modelo do Gemini usado pela extração de PRODUÇÃO.
 *
 * Fica em variável de ambiente porque o Google APOSENTA ids de modelo: o
 * `gemini-2.5-flash` que estava chumbado aqui passou a responder
 * `404 NOT_FOUND ... is no longer available to new users`, e toda extração em
 * produção caiu no catch de `consolidarSessaoCore` (nota salva, extração
 * marcada `pendente_reprocessamento`). Com a variável, a próxima aposentadoria
 * é resolvida no painel do Easypanel, sem deploy de código.
 *
 * O padrão existe de propósito (em vez de fail-closed): sem ele, esquecer a
 * variável derrubaria a extração inteira em silêncio — exatamente o modo de
 * falha que este fix está fechando.
 */
export const MODELO_EXTRACAO_PADRAO = "gemini-3.6-flash";

export function modeloDeExtracao(): string {
  return process.env.GOOGLE_EXTRACTION_MODEL?.trim() || MODELO_EXTRACAO_PADRAO;
}

// Roteamento do provider de extração:
// - clínica demo → stub determinístico (dado fictício, sem LLM).
// - produção → LlmExtractionProvider (Gemini) real SÓ com a flag
//   EXTRACTION_LLM_ENABLED=true E GOOGLE_API_KEY presente. O gate é o
//   guardrail LGPD/DPA (D57): nenhum texto de paciente real sai pro Google
//   enquanto billing pago + escopo do DPA (Serviço Pago = Adendo de
//   Tratamento de Dados automático) + equivalência ao Art. 33 LGPD não
//   estiverem confirmados (a flag só é ligada no Easypanel depois disso).
//   Sem a flag/chave → NullProvider (marca pendente, não chama LLM).
export function resolveProvider(clinic: {
  isDemo: boolean;
}): ExtractionProvider {
  if (clinic.isDemo) return new DemoStubProvider();
  const llmHabilitado =
    process.env.EXTRACTION_LLM_ENABLED === "true" &&
    !!process.env.GOOGLE_API_KEY;
  if (!llmHabilitado) return new NullProvider();
  const modelo = modeloDeExtracao();
  return new LlmExtractionProvider(createGeminiInvoker(modelo), { modelo });
}
