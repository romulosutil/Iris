// Provider real do Agente-3 (LLM Gemini) — esqueleto gated até o prompt/parsing
// serem implementados (`CONVENIO_REPORT_LLM_ENABLED=true` + `GOOGLE_API_KEY`
// configurados; ver resolveConvenioNarrativoProvider em ./provider.ts). D57
// (25/08/26): Gemini é o único provedor de IA do produto — nenhum caminho usa
// Anthropic/Claude.
import type { ConvenioNarrativoProvider } from "./provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

export class GeminiConvenioNarrativoProvider implements ConvenioNarrativoProvider {
  async gerar(_input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> {
    throw new Error(
      "GeminiConvenioNarrativoProvider não implementado (pendente prompt/parsing do Agente 3).",
    );
  }
}
