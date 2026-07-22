// Provider do Agente 2 (Relatório de Família) — interface + roteamento.
// Espelha src/lib/extraction/provider.ts (resolveProvider).
import type { FamilyReportDraft, FamilyReportInput } from "./types";
import { StubFamilyReportProvider } from "./stub-provider";

export interface FamilyReportProvider {
  gerar(input: FamilyReportInput): Promise<FamilyReportDraft>;
}

// Roteamento:
// - clínica demo → stub determinístico (dado fictício, sem LLM).
// - produção com FAMILY_REPORT_LLM_ENABLED=true E ANTHROPIC_API_KEY →
//   ClaudeFamilyReportProvider (real). O gate é o guardrail LGPD/DPA: nenhum
//   dado de paciente real vai à Anthropic antes do DPA + zero-data-retention.
// - qualquer outro caso → stub. O stub NÃO chama LLM e NÃO envia dado a
//   terceiros (lógica local sobre evidências já aprovadas), então é seguro como
//   fallback e nunca quebra o fluxo de geração.
export function resolveFamilyReportProvider(clinic: {
  isDemo: boolean;
}): FamilyReportProvider {
  if (clinic.isDemo) return new StubFamilyReportProvider();
  const llmHabilitado =
    process.env.FAMILY_REPORT_LLM_ENABLED === "true" &&
    !!process.env.ANTHROPIC_API_KEY;
  if (!llmHabilitado) return new StubFamilyReportProvider();
  // Habilitação real do ClaudeProvider é dívida pós-DPA (ver spec §5 / BACKLOG).
  // Enquanto não houver o assembler do prompt do Agente 2 + parsing validado,
  // falha explícita > enviar prompt não auditado. A flag está OFF até lá.
  throw new Error(
    "FAMILY_REPORT_LLM_ENABLED ligado mas ClaudeFamilyReportProvider ainda não implementado (dívida pós-DPA). Desligue a flag para usar o stub.",
  );
}
