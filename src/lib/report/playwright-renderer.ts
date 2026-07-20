import { chromium, type Browser } from "playwright";
import type { PdfRenderer } from "./renderer";
import { withRenderLock } from "./render-lock";

// CSP hard-block: nenhum sub-recurso externo pode ser buscado, independente
// de img/font/@import/iframe/svg/prefetch/meta-refresh. Bloqueado no próprio
// motor de renderização (Blink) antes de qualquer tentativa de rede — mais
// forte que abortar via page.route, que só intercepta depois da tentativa.
const CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'none'; frame-src 'none'; child-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

// meta-refresh dispara uma navegação top-level (não é sub-recurso — CSP
// default-src/frame-src não a cobre). Nenhum relatório legítimo precisa de
// auto-refresh, então a tag é removida estruturalmente antes de renderizar
// (mais forte que confiar em abort de rede para uma navegação inteira).
const META_REFRESH = /<meta\s+[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;

function sanitizarParaRender(html: string): string {
  const semMetaRefresh = html.replace(META_REFRESH, "");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  if (/<head[^>]*>/i.test(semMetaRefresh)) {
    return semMetaRefresh.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  }
  if (/<html[^>]*>/i.test(semMetaRefresh)) {
    return semMetaRefresh.replace(/<html([^>]*)>/i, `<html$1><head>${meta}</head>`);
  }
  return `${meta}${semMetaRefresh}`;
}

export class PlaywrightPdfRenderer implements PdfRenderer {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
    return this.browser;
  }

  /** Render com auditoria de rede — usado nos testes SSRF. */
  async renderComAuditoria(html: string): Promise<{ buffer: Buffer; requestsExternas: string[] }> {
    return withRenderLock(async () => {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ javaScriptEnabled: false });
      const requestsExternas: string[] = [];
      try {
        const page = await context.newPage();
        await page.route("**/*", (route) => {
          requestsExternas.push(route.request().url());
          void route.abort();
        });
        await page.setContent(sanitizarParaRender(html), { waitUntil: "load", timeout: 30_000 });
        const buffer = await page.pdf({ format: "A4", printBackground: true });
        return { buffer, requestsExternas };
      } finally {
        await context.close();
      }
    });
  }

  async render(html: string): Promise<Buffer> {
    const { buffer } = await this.renderComAuditoria(html);
    return buffer;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const playwrightRenderer = new PlaywrightPdfRenderer();
