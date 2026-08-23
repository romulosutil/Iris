import { describe, expect, it } from "vitest";
import { montarRequisicao, executarExportacao } from "./exportacao-acervo.mjs";

describe("scripts/exportacao-acervo.mjs — gatilho do job de exportação", () => {
  it("monta um POST com Bearer no header e corpo vazio", () => {
    const { url, init } = montarRequisicao("https://x.test/j", "segredo");
    expect(url).toBe("https://x.test/j");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer segredo");
    expect(init.body).toBe("{}");
  });

  it("separa falha de status de falha de rede — não afirma uma causa só", async () => {
    const status = await executarExportacao("https://x.test/j", "s", {
      fetch: async () => new Response("boom", { status: 500 }),
    });
    expect(status).toMatchObject({ ok: false, falha: "status", corpo: "boom" });

    const rede = await executarExportacao("https://x.test/j", "s", {
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(rede).toMatchObject({ ok: false, falha: "rede" });
  });

  it("classifica abort como timeout", async () => {
    const res = await executarExportacao("https://x.test/j", "s", {
      timeoutMs: 1,
      fetch: (_u, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    });
    expect(res).toMatchObject({ ok: false, falha: "timeout" });
  });

  it("propaga o corpo da resposta em caso de sucesso", async () => {
    const res = await executarExportacao("https://x.test/j", "s", {
      fetch: async () => new Response('{"ok":true,"expirados":2}'),
    });
    expect(res).toMatchObject({ ok: true });
    expect(JSON.parse(res.corpo)).toMatchObject({ expirados: 2 });
  });

  it("nunca imprime o segredo no objeto de requisição serializado", () => {
    const { init } = montarRequisicao("https://x.test/j", "SEGREDO_REAL");
    // O header carrega o segredo por necessidade; o corpo, nunca.
    expect(init.body).not.toContain("SEGREDO_REAL");
  });
});
