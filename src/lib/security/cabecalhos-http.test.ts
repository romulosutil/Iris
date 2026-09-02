// @vitest-environment node
/**
 * S-06 (auditoria 360, #530) — cabeçalhos de segurança HTTP globais.
 *
 * Mede a função `headers()` exportada por `next.config.ts` (subir o servidor
 * para um GET é caro e não prova nada além do que a config declara). O Next
 * aplica TODAS as entradas cujo `source` casa com a rota, então a entrada
 * global `/(.*)` convive com a de `/auth.md` sem sobrescrevê-la.
 */
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

type Cabecalho = { key: string; value: string };

async function cabecalhosGlobais(): Promise<Map<string, string>> {
  const entradas = await nextConfig.headers!();
  const global = entradas.find((e) => e.source === "/(.*)");
  expect(global, "falta a entrada global `/(.*)` em headers()").toBeDefined();
  return new Map(
    (global!.headers as Cabecalho[]).map((h) => [h.key.toLowerCase(), h.value]),
  );
}

describe("cabeçalhos de segurança (next.config.ts headers())", () => {
  it("nega enquadramento em iframe (clickjacking de tela clínica)", async () => {
    const h = await cabecalhosGlobais();
    expect(h.get("x-frame-options")).toBe("DENY");
  });

  it("não vaza a URL com UUID de paciente ao clicar em link externo", async () => {
    const h = await cabecalhosGlobais();
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("HSTS de 1 ano com subdomínios", async () => {
    const h = await cabecalhosGlobais();
    const hsts = h.get("strict-transport-security") ?? "";
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it("nosniff", async () => {
    const h = await cabecalhosGlobais();
    expect(h.get("x-content-type-options")).toBe("nosniff");
  });

  it("Permissions-Policy mínima: microfone só na própria origem (ditado do diário), câmera fechada", async () => {
    const h = await cabecalhosGlobais();
    const pp = h.get("permissions-policy") ?? "";
    // `use-gravador.ts` chama `getUserMedia({audio})` no diário: `microphone`
    // precisa de `(self)`; fechar tudo quebraria o ditado com CI verde.
    expect(pp).toMatch(/microphone=\(self\)/);
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
    expect(pp).toMatch(/payment=\(\)/);
  });

  it("CSP em modo Report-Only (medir antes de bloquear), sem CSP de bloqueio", async () => {
    const h = await cabecalhosGlobais();
    const csp = h.get("content-security-policy-report-only") ?? "";
    expect(csp).not.toBe("");
    // Enquanto é medição, não pode existir a versão que bloqueia.
    expect(h.has("content-security-policy")).toBe(false);

    // Não pode quebrar GA/Clarity na landing (S-01 mantém os dois lá).
    expect(csp).toMatch(/script-src[^;]*googletagmanager\.com/);
    expect(csp).toMatch(/script-src[^;]*clarity\.ms/);
    expect(csp).toMatch(/connect-src[^;]*google-analytics\.com/);
    expect(csp).toMatch(/connect-src[^;]*clarity\.ms/);

    // Postura mínima que uma futura CSP de bloqueio vai herdar.
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
  });

  it("não perde a entrada de `/auth.md` (Content-Type markdown para agentes)", async () => {
    const entradas = await nextConfig.headers!();
    const authMd = entradas.find((e) => e.source === "/auth.md");
    expect(authMd).toBeDefined();
  });
});
