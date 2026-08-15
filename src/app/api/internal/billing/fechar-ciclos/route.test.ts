// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ResultadoCortePorCarencia,
  ResultadoFechamento,
} from "@/lib/billing/subscription";

/**
 * Gatilho interno do fechamento de ciclo (#36/#319).
 *
 * ## Por que este arquivo é unitário e não `.int.test.ts`
 *
 * O que a rota faz de próprio não toca o banco: ela AUTENTICA, ORQUESTRA três
 * chamadas numa ordem que é decisão de produto, e PUBLICA um JSON que o job
 * (`scripts/fechamento-ciclo-billing.mjs`) registra como o log do faturamento
 * do dia. As garantias de banco de cada etapa já são medidas onde moram
 * (`carencia-vencida.int.test.ts`, `fechamento-provedor-por-linha.int.test.ts`).
 * Rodar isto contra Postgres real trocaria o dublê — que é justamente o
 * instrumento que mede a ORDEM — por dados, e a ordem sumiria da medição.
 *
 * ## A ordem é a asserção central (D-1 da #319)
 *
 * `cancelarAssinaturasComCarenciaVencida` roda DEPOIS de `fecharCiclosVencendo`
 * porque é o fechamento que emite as cobranças do dia e, portanto, produz as
 * recusas que carimbam `past_due`. Varrer a carência antes cortaria, no mesmo
 * tick, uma clínica cuja cobrança ainda ia ser tentada — e o corte REVOGA a
 * autorização de Pix Automático no gateway, ato irreversível que só volta com
 * novo consentimento da clínica no app do banco. Inverter as duas linhas não
 * levanta erro em lugar nenhum: sem este arquivo, o mutante sobrevive a tudo.
 *
 * Por isso a ordem é medida por `mock.invocationCallOrder` — o carimbo real de
 * quando cada dublê foi chamado — e não pela ordem em que as asserções aparecem
 * escritas aqui, que não prova nada sobre o código sob teste.
 *
 * ## Ambiente `node`, não `jsdom`
 *
 * A rota declara `runtime = "nodejs"` e responde com `Response.json`. O default
 * do projeto (`jsdom`) só existe para os testes de componente; medir uma rota de
 * servidor sob ele seria medir o ambiente errado.
 */

const dubles = vi.hoisted(() => ({
  fecharCiclosVencendo: vi.fn(),
  cancelarAssinaturasComCarenciaVencida: vi.fn(),
  reprocessarEventosPendentes: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/subscription", () => dubles);

const { POST } = await import("./route");

/**
 * Token fixado aqui e não lido do `.env`: o `.env` é gitignored, e um teste de
 * autenticação que depende de segredo invisível no review vira verde por
 * omissão no dia em que a var some. Mesmo idioma de `hooks/asaas/route.int.test.ts`.
 */
const TOKEN = "token-do-job-de-billing-319";
const URL_ROTA = "http://localhost/api/internal/billing/fechar-ciclos";

function requisicao(opcoes?: {
  authorization?: string | null;
  corpo?: string;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const auth =
    opcoes && "authorization" in opcoes
      ? opcoes.authorization
      : `Bearer ${TOKEN}`;
  if (auth !== null && auth !== undefined) headers.set("authorization", auth);
  return new Request(URL_ROTA, {
    method: "POST",
    headers,
    body: opcoes?.corpo ?? JSON.stringify({ dryRun: false }),
  });
}

function fechamento(
  over: Partial<ResultadoFechamento> = {},
): ResultadoFechamento {
  return {
    clinicId: crypto.randomUUID(),
    cycleId: crypto.randomUUID(),
    fichasContadas: 12,
    valorCentavos: 46_800,
    cobrancaEmitida: true,
    providerChargeId: `pay_${crypto.randomUUID()}`,
    ...over,
  };
}

function corte(
  over: Partial<ResultadoCortePorCarencia> = {},
): ResultadoCortePorCarencia {
  return {
    clinicId: crypto.randomUUID(),
    subscriptionId: crypto.randomUUID(),
    pastDueDesde: new Date("2026-07-01T03:00:00.000Z"),
    carenciaDias: 10,
    cortada: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BILLING_JOB_TOKEN", TOKEN);
  dubles.reprocessarEventosPendentes.mockResolvedValue({
    aplicados: 0,
    falhas: 0,
  });
  dubles.fecharCiclosVencendo.mockResolvedValue([]);
  dubles.cancelarAssinaturasComCarenciaVencida.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/internal/billing/fechar-ciclos — ordem das etapas", () => {
  it("varre a carência DEPOIS de fechar os ciclos (D-1 da #319)", async () => {
    const resposta = await POST(requisicao());
    expect(resposta.status).toBe(200);

    const ordemFechamento =
      dubles.fecharCiclosVencendo.mock.invocationCallOrder[0];
    const ordemCarencia =
      dubles.cancelarAssinaturasComCarenciaVencida.mock.invocationCallOrder[0];

    // Ambas precisam ter acontecido: um `undefined < undefined` seria falso
    // por acidente e não distinguiria "ordem trocada" de "nunca chamou".
    expect(ordemFechamento).toBeTypeOf("number");
    expect(ordemCarencia).toBeTypeOf("number");
    expect(ordemCarencia).toBeGreaterThan(ordemFechamento!);
  });

  it("reprocessa os eventos pendentes ANTES de fechar os ciclos", async () => {
    // Uma clínica cujo evento de ativação só agora se aplica precisa entrar no
    // estado antes da varredura, senão fica de fora deste fechamento.
    await POST(requisicao());

    const ordemReprocesso =
      dubles.reprocessarEventosPendentes.mock.invocationCallOrder[0];
    const ordemFechamento =
      dubles.fecharCiclosVencendo.mock.invocationCallOrder[0];

    expect(ordemReprocesso).toBeTypeOf("number");
    expect(ordemFechamento).toBeTypeOf("number");
    expect(ordemFechamento).toBeGreaterThan(ordemReprocesso!);
  });
});

describe("POST /api/internal/billing/fechar-ciclos — autorização", () => {
  it("recusa sem header `authorization` e não dispara nada", async () => {
    const resposta = await POST(requisicao({ authorization: null }));

    expect(resposta.status).toBe(401);
    // A rota emite cobrança e revoga autorização de Pix. "401" sem provar que
    // nada rodou deixaria passar um guard que responde 401 depois do efeito.
    expect(dubles.reprocessarEventosPendentes).not.toHaveBeenCalled();
    expect(dubles.fecharCiclosVencendo).not.toHaveBeenCalled();
    expect(dubles.cancelarAssinaturasComCarenciaVencida).not.toHaveBeenCalled();
  });

  it("recusa token errado de MESMO comprimento", async () => {
    // Mesmo comprimento de propósito: um guard que só comparasse tamanho
    // passaria aqui, e é a comparação em tempo constante que precisa decidir.
    const errado = `${"x".repeat(TOKEN.length - 1)}!`;
    expect(errado).toHaveLength(TOKEN.length);

    const resposta = await POST(
      requisicao({ authorization: `Bearer ${errado}` }),
    );

    expect(resposta.status).toBe(401);
    expect(dubles.fecharCiclosVencendo).not.toHaveBeenCalled();
  });

  it("recusa token errado de comprimento diferente", async () => {
    const resposta = await POST(
      requisicao({ authorization: `Bearer ${TOKEN}-sobra` }),
    );

    expect(resposta.status).toBe(401);
    expect(dubles.fecharCiclosVencendo).not.toHaveBeenCalled();
  });

  it("recusa o token cru, sem o esquema `Bearer `", async () => {
    const resposta = await POST(requisicao({ authorization: TOKEN }));

    expect(resposta.status).toBe(401);
    expect(dubles.fecharCiclosVencendo).not.toHaveBeenCalled();
  });

  it("recusa TUDO quando `BILLING_JOB_TOKEN` não está no ambiente", async () => {
    // Fail-closed: um deploy sem o segredo deve recusar, nunca "passar porque
    // não há token configurado" — o endpoint dispara cobrança.
    vi.stubEnv("BILLING_JOB_TOKEN", undefined);

    const resposta = await POST(requisicao());

    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ error: "não autorizado" });
    expect(dubles.fecharCiclosVencendo).not.toHaveBeenCalled();
    expect(dubles.cancelarAssinaturasComCarenciaVencida).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal/billing/fechar-ciclos — dry-run", () => {
  it("propaga `dryRun` para o fechamento E para o corte por carência", async () => {
    // O corte revoga autorização de Pix no gateway. Um `dryRun` que chegasse só
    // ao fechamento faria um ensaio cortar clínica de verdade — irreversível.
    await POST(requisicao({ corpo: JSON.stringify({ dryRun: true }) }));

    expect(dubles.fecharCiclosVencendo).toHaveBeenCalledWith({ dryRun: true });
    expect(dubles.cancelarAssinaturasComCarenciaVencida).toHaveBeenCalledWith({
      dryRun: true,
    });
  });

  it("trata corpo ausente ou malformado como execução normal", async () => {
    const resposta = await POST(requisicao({ corpo: "isto não é json" }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ dryRun: false });
    expect(dubles.cancelarAssinaturasComCarenciaVencida).toHaveBeenCalledWith({
      dryRun: false,
    });
  });

  it("só aceita `dryRun` estritamente booleano `true`", async () => {
    // `"true"` de um cliente que serializou errado NÃO pode virar ensaio: a
    // interpretação frouxa faria o faturamento do dia inteiro não acontecer.
    await POST(requisicao({ corpo: JSON.stringify({ dryRun: "true" }) }));

    expect(dubles.fecharCiclosVencendo).toHaveBeenCalledWith({ dryRun: false });
  });
});

describe("POST /api/internal/billing/fechar-ciclos — corpo da resposta", () => {
  it("publica contagens e listas do fechamento e do corte separadas", async () => {
    const ok = fechamento({ fichasContadas: 3, valorCentavos: 11_700 });
    const falhou = fechamento({
      cobrancaEmitida: false,
      providerChargeId: undefined,
      erro: "gateway respondeu 502",
    });
    const cortada = corte();
    const naoCortada = corte({
      cortada: false,
      etapaFalha: "gateway",
      erro: "gateway: 502 ao revogar vínculo",
    });

    dubles.reprocessarEventosPendentes.mockResolvedValue({
      aplicados: 2,
      falhas: 1,
    });
    dubles.fecharCiclosVencendo.mockResolvedValue([ok, falhou]);
    dubles.cancelarAssinaturasComCarenciaVencida.mockResolvedValue([
      cortada,
      naoCortada,
    ]);

    const resposta = await POST(requisicao());
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();

    expect(corpo).toMatchObject({
      ok: true,
      dryRun: false,
      eventosReprocessados: { aplicados: 2, falhas: 1 },
      ciclosProcessados: 2,
      carenciaAvaliadas: 2,
      carenciaCortadas: 1,
    });

    // As duas leituras ficam separadas de propósito: `ciclosProcessados` e
    // `falhas` são lidas no log do job como "faturamento do dia", e somar corte
    // de inadimplente ali tornaria impossível separá-las depois do fato.
    expect(corpo.falhas).toEqual([
      { clinicId: falhou.clinicId, erro: "gateway respondeu 502" },
    ]);
    expect(corpo.carenciaFalhas).toEqual([
      {
        clinicId: naoCortada.clinicId,
        erro: "gateway: 502 ao revogar vínculo",
      },
    ]);
    expect(corpo.resultados).toEqual([
      {
        clinicId: ok.clinicId,
        fichasContadas: 3,
        valorCentavos: 11_700,
        cobrancaEmitida: true,
        providerChargeId: ok.providerChargeId,
      },
      {
        clinicId: falhou.clinicId,
        fichasContadas: falhou.fichasContadas,
        valorCentavos: falhou.valorCentavos,
        cobrancaEmitida: false,
      },
    ]);
    expect(corpo.cortesPorCarencia).toEqual([
      {
        clinicId: cortada.clinicId,
        pastDueDesde: cortada.pastDueDesde.toISOString(),
        carenciaDias: 10,
        cortada: true,
      },
      {
        clinicId: naoCortada.clinicId,
        pastDueDesde: naoCortada.pastDueDesde.toISOString(),
        carenciaDias: 10,
        cortada: false,
      },
    ]);
  });

  it("sobe `carenciaTruncado: true` quando a passada bateu o teto", async () => {
    // O job só registra este JSON. Sem o flag no corpo, uma passada que parou
    // no teto com fila atrás é indistinguível de uma que cobriu tudo — e o
    // `console.warn` da lib não chega ao log do job.
    dubles.cancelarAssinaturasComCarenciaVencida.mockResolvedValue([
      corte({ truncado: true }),
      corte({ truncado: true }),
    ]);

    const corpo = await (await POST(requisicao())).json();

    expect(corpo.carenciaTruncado).toBe(true);
  });

  it("mantém `carenciaTruncado: false` quando a passada cobriu tudo", async () => {
    dubles.cancelarAssinaturasComCarenciaVencida.mockResolvedValue([
      corte(),
      corte(),
    ]);

    const corpo = await (await POST(requisicao())).json();

    expect(corpo.carenciaTruncado).toBe(false);
  });

  it("sobe o truncamento mesmo se um único item o carimbar", async () => {
    // Guarda contra a troca de `some` por `every`: a lib carimba o flag em
    // todos os itens hoje, e um consumidor que exija unanimidade se cala no dia
    // em que esse detalhe mudar.
    dubles.cancelarAssinaturasComCarenciaVencida.mockResolvedValue([
      corte(),
      corte({ truncado: true }),
    ]);

    const corpo = await (await POST(requisicao())).json();

    expect(corpo.carenciaTruncado).toBe(true);
  });
});

describe("POST /api/internal/billing/fechar-ciclos — falha que aborta a passada", () => {
  it("responde 500 com o texto real do erro e NÃO corta ninguém", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dubles.fecharCiclosVencendo.mockRejectedValue(
      new Error("connection terminated unexpectedly"),
    );

    const resposta = await POST(requisicao());

    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({
      ok: false,
      error: "connection terminated unexpectedly",
    });
    // Consequência da ordem, e o lado seguro: se o fechamento morreu, ninguém
    // sabe quais recusas o dia produziria, então ninguém é cortado.
    expect(dubles.cancelarAssinaturasComCarenciaVencida).not.toHaveBeenCalled();
  });

  it("descarta o relatório do fechamento quando o corte lança (comportamento atual)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const emitida = fechamento();
    dubles.fecharCiclosVencendo.mockResolvedValue([emitida]);
    dubles.cancelarAssinaturasComCarenciaVencida.mockRejectedValue(
      new Error("timeout ao revogar vínculo"),
    );

    const resposta = await POST(requisicao());
    const corpo = await resposta.json();

    // NÃO é o comportamento desejável, e está medido aqui para que a mudança
    // seja deliberada: as cobranças do dia JÁ foram emitidas no gateway quando
    // esta exceção sobe, e o único registro delas (`resultados`) some do corpo.
    // O job registra apenas "falhou", e o operador fica sem saber quem foi
    // cobrado. Ver relatório da issue — decisão de produto, não conserto local.
    expect(resposta.status).toBe(500);
    expect(corpo).toEqual({ ok: false, error: "timeout ao revogar vínculo" });
    expect(corpo.resultados).toBeUndefined();
    expect(dubles.fecharCiclosVencendo).toHaveBeenCalledTimes(1);
  });
});
