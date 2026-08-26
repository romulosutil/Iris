// Provider do Agente 2 (Relatório de Família) — interface + roteamento.
// Espelha src/lib/extraction/provider.ts (resolveProvider).
import { GeminiFamilyReportProvider } from "./gemini-provider";
import type { FamilyReportDraft, FamilyReportInput } from "./types";
import { StubFamilyReportProvider } from "./stub-provider";

export interface FamilyReportProvider {
  gerar(input: FamilyReportInput): Promise<FamilyReportDraft>;
}

// Roteamento:
// - clínica demo → stub determinístico (dado fictício, sem LLM).
// - produção com FAMILY_REPORT_LLM_ENABLED=true E GOOGLE_API_KEY →
//   GeminiFamilyReportProvider (esqueleto — gerar() ainda lança, pendente
//   prompt/parsing do Agente 2). D57 (25/08/26): Gemini é o único provedor de
//   IA do produto; nenhum caminho usa Anthropic/Claude.
// - qualquer outro caso → stub. O stub NÃO chama LLM e NÃO envia dado a
//   terceiros (lógica local sobre evidências já aprovadas), então é seguro como
//   fallback e nunca quebra o fluxo de geração.
export function resolveFamilyReportProvider(clinic: {
  isDemo: boolean;
}): FamilyReportProvider {
  if (clinic.isDemo) return new StubFamilyReportProvider();
  const llmHabilitado =
    process.env.FAMILY_REPORT_LLM_ENABLED === "true" &&
    !!process.env.GOOGLE_API_KEY;
  if (!llmHabilitado) return new StubFamilyReportProvider();
  return new GeminiFamilyReportProvider();
}
