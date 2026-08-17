// Provider real do Agente-3 (LLM Claude) — esqueleto gated até DPA assinado
// e `CONVENIO_REPORT_LLM_ENABLED=true` + `ANTHROPIC_API_KEY` configurados
// (ver resolveConvenioNarrativoProvider em ./provider.ts).
import type { ConvenioNarrativoProvider } from "./provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

export class ClaudeConvenioNarrativoProvider implements ConvenioNarrativoProvider {
  async gerar(_input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> {
    throw new Error(
      "ClaudeConvenioNarrativoProvider não habilitado (pendente DPA/CONVENIO_REPORT_LLM_ENABLED).",
    );
  }
}
