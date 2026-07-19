import { sha256Hex } from "./hash";

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
}

// Renderer determinístico p/ testes de export — sem browser.
export class StubPdfRenderer implements PdfRenderer {
  async render(html: string): Promise<Buffer> {
    // bytes estáveis derivados do conteúdo, p/ asserção de hash em testes.
    return Buffer.from(`%PDF-STUB ${sha256Hex(Buffer.from(html))}`);
  }
}
