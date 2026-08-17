import type { AlertaRiscoAgente } from "./agent-output-schema";

export type ExtractionContext = {
  sessionId: string;
  clinicId: string;
  notaConsolidada: string;
  metasAtivas: Array<{ id: string; descricao: string }>;
  // Contrato canônico montado pelo assembler (protocolos-e-agente.md Parte 2).
  // Opcional: stubs demo/null ignoram; o ClaudeProvider real o envia ao LLM.
  contextoCanonico?: unknown;
};

export type ExtractionSubtipo =
  | "evidencia"
  | "registro_abc"
  | "ausencia_comportamento"
  | "cadeia"
  | "preferencia_reforcador"
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
export type ExtractionResult = {
  drafts: ExtractionDraft[];
  alertaRisco: AlertaRiscoAgente | null;
};

export interface ExtractionProvider {
  extrair(ctx: ExtractionContext): Promise<ExtractionResult>;
}

import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";
import { ClaudeProvider, createAnthropicInvoker } from "./claude-provider";

// Roteamento do provider de extração:
// - clínica demo → stub determinístico (dado fictício, sem LLM).
// - produção → ClaudeProvider real SÓ com a flag EXTRACTION_LLM_ENABLED=true E
//   ANTHROPIC_API_KEY presente. O gate é o guardrail LGPD/DPA: nenhum texto de
//   paciente real sai para a Anthropic enquanto o DPA + zero-data-retention não
//   estiverem confirmados (a flag só é ligada no Easypanel depois disso).
//   Sem a flag/chave → NullProvider (marca pendente, não chama LLM).
export function resolveProvider(clinic: {
  isDemo: boolean;
}): ExtractionProvider {
  if (clinic.isDemo) return new DemoStubProvider();
  const llmHabilitado =
    process.env.EXTRACTION_LLM_ENABLED === "true" &&
    !!process.env.ANTHROPIC_API_KEY;
  return llmHabilitado
    ? new ClaudeProvider(createAnthropicInvoker())
    : new NullProvider();
}
