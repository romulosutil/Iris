import { describe, expect, it, vi } from "vitest";
import {
  executarConciliacao,
  montarRequisicao,
  resumoDoCorpo,
} from "./conciliacao-billing.mjs";

describe("montarRequisicao", () => {
  it("POST com bearer e sem corpo de mutação", () => {
    const { url, init } = montarRequisicao("https://x.test/c", "segredo");
    expect(url).toBe("https://x.test/c");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer segredo");
    // A conciliação não tem parâmetro de execução: nada de `dryRun`, porque
    // nada nela escreve. Corpo com opção sugeriria que há um modo que escreve.
    expect(init.body).toBeUndefined();
  });
});

describe("executarConciliacao", () => {
  it("distingue timeout de rede de status — nunca afirma UMA causa", async () => {
    const timeout = Object.assign(new Error("abortado"), {
      name: "TimeoutError",
    });
    const r1 = await executarConciliacao(vi.fn().mockRejectedValue(timeout), {
      url: "u",
      token: "t",
      timeoutMs: 5,
    });
    expect(r1).toMatchObject({ ok: false, falha: "timeout", status: null });

    const r2 = await executarConciliacao(
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      {
        url: "u",
        token: "t",
      },
    );
    expect(r2).toMatchObject({ ok: false, falha: "rede" });

    const r3 = await executarConciliacao(
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "boom",
        }),
      { url: "u", token: "t" },
    );
    expect(r3).toMatchObject({
      ok: false,
      falha: "status",
      status: 500,
      corpo: "boom",
    });
  });

  it("propaga o corpo no caminho de sucesso", async () => {
    const r = await executarConciliacao(
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => '{"totalDivergencias":0}',
        }),
      { url: "u", token: "t" },
    );
    expect(r).toMatchObject({
      ok: true,
      status: 200,
      corpo: '{"totalDivergencias":0}',
    });
  });
});

describe("resumoDoCorpo", () => {
  it("levanta o que muda a reação do operador", () => {
    const corpo = JSON.stringify({
      totalDivergencias: 3,
      ciclos: {
        conferidos: 10,
        truncado: true,
        falhas: [{ cicloId: "c" }],
        divergencias: [1, 2],
      },
      vinculos: {
        conferidos: 2,
        truncado: false,
        falhas: [],
        divergencias: [3],
      },
      cobrancasSemCiclo: [{ asaasEventId: "e" }],
      ciclosAbortado: null,
      vinculosAbortado: "gateway fora",
    });
    expect(resumoDoCorpo(corpo)).toEqual({
      totalDivergencias: 3,
      ciclosConferidos: 10,
      ciclosTruncado: true,
      vinculosConferidos: 2,
      vinculosTruncado: false,
      falhasDeConsulta: 1,
      cobrancasSemCiclo: 1,
      ciclosAbortado: null,
      vinculosAbortado: "gateway fora",
      cobrancasSemCicloAbortado: null,
    });
  });

  it("corpo não-JSON volta tudo nulo, sem lançar", () => {
    expect(resumoDoCorpo("<html>proxy</html>").totalDivergencias).toBeNull();
    expect(resumoDoCorpo(undefined).ciclosConferidos).toBeNull();
  });

  it("chave AUSENTE é null, nunca zero", () => {
    // Corpo de uma rota ANTIGA não tem a chave, e `0` é resposta diferente de
    // "a rota nem relatou". Ler `undefined` como zero afirmaria "conferi tudo e
    // não achei nada" sem ter medido.
    expect(resumoDoCorpo("{}").ciclosConferidos).toBeNull();
    expect(resumoDoCorpo("{}").ciclosTruncado).toBeNull();
  });
});
