// StubAsrProvider — transcrição determinística, SEM rede (R22). Usado em
// CI/teste/demo; nunca chama `fetch`. Espelha StubFamilyReportProvider
// (src/lib/report/familia/stub-provider.ts) e StubConvenioNarrativoProvider.
import type { AsrProvider } from "./provider";

export class StubAsrProvider implements AsrProvider {
  async transcrever(
    audio: Uint8Array,
    mime: string,
  ): Promise<{ texto: string }> {
    return {
      texto: `[transcrição stub — ${audio.byteLength} bytes, ${mime}]`,
    };
  }
}
