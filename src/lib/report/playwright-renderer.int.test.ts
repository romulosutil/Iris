import { afterAll, describe, expect, test } from "vitest";
import { PlaywrightPdfRenderer } from "./playwright-renderer";

const renderer = new PlaywrightPdfRenderer();
afterAll(async () => {
  await renderer.close();
});

const VETORES: Array<[string, string]> = [
  ["img file", `<img src="file:///etc/passwd">`],
  ["img http", `<img src="http://169.254.169.254/latest/meta-data/">`],
  [
    "font remoto",
    `<style>@font-face{font-family:x;src:url(http://attacker.test/f.woff)}</style><p style="font-family:x">a</p>`,
  ],
  ["css import", `<style>@import url(http://attacker.test/x.css);</style>`],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=http://attacker.test/">`],
  ["svg image", `<svg><image href="http://attacker.test/x.png"/></svg>`],
  ["iframe", `<iframe src="http://attacker.test/"></iframe>`],
  ["link prefetch", `<link rel="prefetch" href="http://attacker.test/x">`],
];

test.each(VETORES)("zero request de saída — %s", async (_nome, corpo) => {
  const { buffer, requestsExternas } = await renderer.renderComAuditoria(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${corpo}</body></html>`,
  );
  expect(requestsExternas).toEqual([]);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
});

test("render de HTML factual gera PDF real", async () => {
  const pdf = await renderer.render(`<!doctype html><html><body><h1>Dossiê</h1></body></html>`);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(500);
});
