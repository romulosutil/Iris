import { describe, expect, it } from "vitest";
import {
  montarRequisicao,
  executarExportacao,
  contarBundlesFalhos,
} from "./exportacao-acervo.mjs";

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

  it("bundle `falhou` no corpo de um 200 é FALHA do disparo, não sucesso (Q-07, #530)", async () => {
    // O "exit 0 mentiroso" da #105 recorrendo: HTTP ok com todo bundle em
    // `falhou` saía `0` e o acervo ficava pendente "para sempre" sem sinal.
    const res = await executarExportacao("https://x.test/j", "s", {
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            processados: [
              { bundleId: "b1", status: "falhou", erro: "storage fora" },
              { bundleId: "b2", status: "pronto" },
            ],
            totalProcessados: 2,
            expirados: 0,
          }),
          { status: 200 },
        ),
    });
    expect(res).toMatchObject({ ok: false, falha: "bundle" });
    expect(res.erro).toContain("1");
    // O corpo vai inteiro para o log — é a única memória da passada.
    expect(res.corpo).toContain("storage fora");
  });

  it("`ok:false` no corpo de um 200 também é falha (rota e script concordam)", async () => {
    const res = await executarExportacao("https://x.test/j", "s", {
      fetch: async () =>
        new Response(JSON.stringify({ ok: false, processados: [] }), {
          status: 200,
        }),
    });
    expect(res).toMatchObject({ ok: false, falha: "bundle" });
  });

  it("contarBundlesFalhos: JSON inválido conta 0 (o status HTTP já decidiu)", () => {
    expect(contarBundlesFalhos("não é json")).toBe(0);
    expect(contarBundlesFalhos('{"ok":true,"processados":[]}')).toBe(0);
    expect(
      contarBundlesFalhos(
        '{"ok":false,"processados":[{"status":"falhou"},{"status":"falhou"}]}',
      ),
    ).toBe(2);
    // `ok:false` sem lista de bundles ainda conta como falha (>= 1).
    expect(contarBundlesFalhos('{"ok":false}')).toBe(1);
  });

  it("nunca imprime o segredo no objeto de requisição serializado", () => {
    const { init } = montarRequisicao("https://x.test/j", "SEGREDO_REAL");
    // O header carrega o segredo por necessidade; o corpo, nunca.
    expect(init.body).not.toContain("SEGREDO_REAL");
  });
});
