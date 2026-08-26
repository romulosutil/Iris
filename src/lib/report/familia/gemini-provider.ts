// Provider real do Agente-2 (LLM Gemini) — esqueleto gated até o prompt/parsing
// serem implementados (`FAMILY_REPORT_LLM_ENABLED=true` + `GOOGLE_API_KEY`
// configurados; ver resolveFamilyReportProvider em ./provider.ts). D57
// (25/08/26): Gemini é o único provedor de IA do produto — nenhum caminho usa
// Anthropic/Claude.
import type { FamilyReportProvider } from "./provider";
import type { FamilyReportDraft, FamilyReportInput } from "./types";

export class GeminiFamilyReportProvider implements FamilyReportProvider {
  async gerar(_input: FamilyReportInput): Promise<FamilyReportDraft> {
    throw new Error(
      "GeminiFamilyReportProvider não implementado (pendente prompt/parsing do Agente 2).",
    );
  }
}
