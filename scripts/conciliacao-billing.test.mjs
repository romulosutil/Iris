import { describe, expect, it, vi } from "vitest";
import {
  agregarResumo,
  avancarBraco,
  camposDoBraco,
  decidirDesfecho,
  estadoInicialDoBraco,
  executarConciliacao,
  montarRequisicao,
  resumoDoCorpo,
} from "./conciliacao-billing.mjs";

const resumoVazio = {
  totalDivergencias: 0,
  ciclosConferidos: 0,
  ciclosTruncado: false,
  vinculosConferidos: 0,
  vinculosTruncado: false,
  falhasDeConsulta: 0,
  cobrancasSemCiclo: 0,
  cobrancasSemCicloTruncado: false,
  ciclosAbortado: null,
  vinculosAbortado: null,
  cobrancasSemCicloAbortado: null,
};

describe("montarRequisicao", () => {
  it("POST com bearer e corpo de paginação vazio por padrão", () => {
    const { url, init } = montarRequisicao("https://x.test/c", "segredo");
    expect(url).toBe("https://x.test/c");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer segredo");
    // O corpo só carrega paginação (offset/limite por braço) — nada de
    // `dryRun`, porque nada na conciliação escreve.
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("corpo carrega offset/limite por braço quando informado", () => {
    const { init } = montarRequisicao("https://x.test/c", "segredo", {
      ciclosOffset: 100,
      vinculosLimite: 0,
    });
    expect(JSON.parse(init.body)).toEqual({
      ciclosOffset: 100,
      vinculosLimite: 0,
    });
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
      vi.fn().mockResolvedValue({
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
      vi.fn().mockResolvedValue({
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
      cobrancasSemCicloTruncado: true,
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
      cobrancasSemCicloTruncado: true,
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
    expect(resumoDoCorpo("{}").cobrancasSemCicloTruncado).toBeNull();
  });
});

describe("decidirDesfecho", () => {
  it("passada limpa: exit 0 e ok logado true", () => {
    const d = decidirDesfecho({ ok: true }, resumoVazio);
    expect(d.exitCode).toBe(0);
    expect(d.okLogado).toBe(true);
    expect(d.avisos).toEqual([]);
  });

  it("falhasDeConsulta > 0 avisa e força exit 1, mesmo com totalDivergencias: 0 (achado 2)", () => {
    const d = decidirDesfecho(
      { ok: true },
      { ...resumoVazio, falhasDeConsulta: 3 },
    );
    expect(d.exitCode).toBe(1);
    expect(d.avisos.some((a) => a.includes("falha(s) de consulta"))).toBe(true);
  });

  it("cobrancasSemCicloTruncado soma ao aviso de truncamento (achado 3)", () => {
    // Truncamento sozinho não força exit 1 (mesmo comportamento pré-existente
    // de `ciclosTruncado`/`vinculosTruncado`) — mas o terceiro braço agora
    // participa do MESMO aviso, e não fica mudo como antes do achado 3.
    const d = decidirDesfecho(
      { ok: true },
      { ...resumoVazio, cobrancasSemCicloTruncado: true },
    );
    expect(d.avisos.some((a) => a.includes("parou no TETO"))).toBe(true);
  });

  it("`ok` logado reflete abortou, mesmo com resultado.ok true (achado 8)", () => {
    const d = decidirDesfecho(
      { ok: true },
      { ...resumoVazio, ciclosAbortado: "gateway fora" },
    );
    expect(d.okLogado).toBe(false);
    expect(d.exitCode).toBe(1);
  });

  it("divergência encontrada força exit 1", () => {
    const d = decidirDesfecho(
      { ok: true },
      { ...resumoVazio, totalDivergencias: 1 },
    );
    expect(d.exitCode).toBe(1);
    expect(d.okLogado).toBe(true); // a passada RODOU inteira; achou é outra coisa
  });
});

describe("paginação — achado BLOCKING do PR #468", () => {
  it("avança offset enquanto truncado, esgota quando falso — nunca repete a mesma página", () => {
    let estado = estadoInicialDoBraco();
    expect(camposDoBraco("ciclos", estado)).toEqual({});

    // 1ª passada: 100 conferidos, truncado — há fila atrás.
    estado = avancarBraco(estado, 100, true);
    expect(estado).toEqual({ offset: 100, esgotado: false });
    expect(camposDoBraco("ciclos", estado)).toEqual({ ciclosOffset: 100 });

    // 2ª passada: mais 30 conferidos, não truncou mais — braço esgotado.
    estado = avancarBraco(estado, 30, false);
    expect(estado).toEqual({ offset: 100, esgotado: true });
    // Esgotado pula a query inteira na rota (`limite: 0`), nunca reabre offset.
    expect(camposDoBraco("ciclos", estado)).toEqual({ ciclosLimite: 0 });

    // Uma 3ª chamada em cima de um braço já esgotado não regride o estado —
    // é exatamente o loop que travava o operador antes do fix.
    estado = avancarBraco(estado, 999, true);
    expect(estado).toEqual({ offset: 100, esgotado: true });
  });

  it("agrega conferidos/divergências de várias páginas somando, não sobrescrevendo", () => {
    const p1 = {
      ...resumoVazio,
      ciclosConferidos: 100,
      ciclosTruncado: true,
      totalDivergencias: 2,
    };
    const p2 = {
      ...resumoVazio,
      ciclosConferidos: 30,
      ciclosTruncado: false,
      totalDivergencias: 1,
    };
    const agregado = agregarResumo(agregarResumo(resumoVazio, p1), p2);
    expect(agregado.ciclosConferidos).toBe(130);
    expect(agregado.totalDivergencias).toBe(3);
    expect(agregado.ciclosTruncado).toBe(false); // esgotou na última página
  });

  it("aborto na primeira página não é apagado por um sucesso na segunda", () => {
    const p1 = { ...resumoVazio, ciclosAbortado: "erro-db" };
    const p2 = { ...resumoVazio, ciclosAbortado: null };
    const agregado = agregarResumo(agregarResumo(resumoVazio, p1), p2);
    expect(agregado.ciclosAbortado).toBe("erro-db");
  });
});
