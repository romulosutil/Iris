export type ExtractionContext = {
  sessionId: string;
  clinicId: string;
  notaConsolidada: string;
  metasAtivas: Array<{ id: string; descricao: string }>;
};

export type ExtractionDraft = {
  subtipo: string;
  trechoFonte: string;
  confianca: "alta" | "media" | "baixa";
  justificativaConfianca?: string;
  inconsistenteComHistorico: boolean;
  parContrasteId: string | null;
  payload: unknown;
  estado: "sugerida" | "pendente_reprocessamento";
};

export interface ExtractionProvider {
  extrair(ctx: ExtractionContext): Promise<ExtractionDraft[]>;
}

import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";

// Roteamento por flag de clínica. Fase 3 troca o ramo de produção pelo
// ClaudeProvider real (R1-R19 + hardening prompt-injection) — mudança de 1 linha.
export function resolveProvider(clinic: { isDemo: boolean }): ExtractionProvider {
  return clinic.isDemo ? new DemoStubProvider() : new NullProvider();
}
