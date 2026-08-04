import { describe, expect, it, vi } from "vitest";
import { executarFechamento, montarRequisicao } from "./fechamento-ciclo-billing.mjs";

const URL_ALVO = "https://irisclinica.ia.br/api/internal/billing/fechar-ciclos";
const TOKEN = "token-secreto-de-teste-nao-deve-vazar";

// Dublê de fetch como FUNÇÃO comum (não `new`-ável, e nada aqui é construído
// com `new`). A armadilha registrada no repo (#154) é o oposto: dublê feito com
// arrow para algo usado com `new` estoura, cai no catch do código sob teste e o
// teste passa PELO CAMINHO ERRADO. Aqui o contrato é só "chamável e devolve uma
// Response-like", então o dublê é minimamente compatível de propósito.
function fetchDe({ status = 200, corpo = "{}" } = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => corpo,
  }));
}

describe("fechamento-ciclo-billing — montarRequisicao", () => {
  it("monta POST autenticado com content-type json", () => {
    const { url, init } = montarRequisicao(URL_ALVO, TOKEN, { dryRun: false });

    expect(url).toBe(URL_ALVO);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("o body reflete o dryRun recebido", () => {
    expect(JSON.parse(montarRequisicao(URL_ALVO, TOKEN, { dryRun: true }).init.body)).toEqual({
      dryRun: true,
    });
    expect(JSON.parse(montarRequisicao(URL_ALVO, TOKEN, { dryRun: false }).init.body)).toEqual({
      dryRun: false,
    });
  });
});

describe("fechamento-ciclo-billing — executarFechamento", () => {
  it("200: ok true, status e corpo propagados", async () => {
    const fetchImpl = fetchDe({ status: 200, corpo: '{"ciclosFechados":3}' });

    const res = await executarFechamento(fetchImpl, { url: URL_ALVO, token: TOKEN });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.corpo).toBe('{"ciclosFechados":3}');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passa method/authorization/body reais ao fetch (não só monta em memória)", async () => {
    const fetchImpl = fetchDe();

    await executarFechamento(fetchImpl, { url: URL_ALVO, token: TOKEN, dryRun: true });

    const [alvo, init] = fetchImpl.mock.calls[0];
    expect(alvo).toBe(URL_ALVO);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ dryRun: true });
    expect(init.signal).toBeDefined();
  });

  // O corpo REAL tem que chegar ao operador. Sem isso, um 500 com a causa do
  // lado do Next vira "falhou" e nada mais — diagnóstico caro por omissão.
  it("500 com corpo de texto: ok false e o corpo real aparece no resultado", async () => {
    const fetchImpl = fetchDe({ status: 500, corpo: "erro: conexao com asaas recusada" });

    const res = await executarFechamento(fetchImpl, { url: URL_ALVO, token: TOKEN });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.corpo).toBe("erro: conexao com asaas recusada");
    expect(res.erro).toContain("erro: conexao com asaas recusada");
    expect(res.falha).toBe("status");
  });

  it("erro de rede: ok false, falha=rede, sem lançar para fora", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: ECONNREFUSED");
    });

    const res = await executarFechamento(fetchImpl, { url: URL_ALVO, token: TOKEN });

    expect(res.ok).toBe(false);
    expect(res.falha).toBe("rede");
    expect(res.erro).toContain("ECONNREFUSED");
    expect(res.status).toBeNull();
  });

  it("timeout é distinguido de erro de rede comum", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });

    const res = await executarFechamento(fetchImpl, {
      url: URL_ALVO,
      token: TOKEN,
      timeoutMs: 1234,
    });

    expect(res.ok).toBe(false);
    expect(res.falha).toBe("timeout");
    expect(res.erro).toContain("1234ms");
  });

  // Um token em log é um token vazado: vaza = terceiro dispara cobrança.
  it("o token nunca aparece no resultado, nem serializado", async () => {
    for (const fetchImpl of [
      fetchDe({ status: 200, corpo: "ok" }),
      fetchDe({ status: 500, corpo: "boom" }),
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    ]) {
      const res = await executarFechamento(fetchImpl, { url: URL_ALVO, token: TOKEN });
      expect(JSON.stringify(res)).not.toContain(TOKEN);
    }
  });
});
