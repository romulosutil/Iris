import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dubles = vi.hoisted(() => ({
  conciliarCiclos: vi.fn(),
  conciliarVinculos: vi.fn(),
  listarCobrancasDeCicloNaoConciliadas: vi.fn(),
}));

vi.mock("@/lib/billing/conciliacao", () => ({
  conciliarCiclos: dubles.conciliarCiclos,
  conciliarVinculos: dubles.conciliarVinculos,
}));
vi.mock("@/lib/billing/erro-aplicacao", () => ({
  listarCobrancasDeCicloNaoConciliadas:
    dubles.listarCobrancasDeCicloNaoConciliadas,
}));

const { POST } = await import("./route");

const TOKEN = "token-de-teste-375";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://exemplo.test/api/internal/billing/conciliar", {
    method: "POST",
    headers,
  });
}

function vazio() {
  return { conferidos: 0, divergencias: [], falhas: [], truncado: false };
}

describe("POST /api/internal/billing/conciliar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_JOB_TOKEN = TOKEN;
    dubles.conciliarCiclos.mockResolvedValue(vazio());
    dubles.conciliarVinculos.mockResolvedValue(vazio());
    dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.BILLING_JOB_TOKEN;
  });

  it("401 sem header", async () => {
    const r = await POST(req());
    expect(r.status).toBe(401);
    expect(dubles.conciliarCiclos).not.toHaveBeenCalled();
  });

  it("401 com token errado", async () => {
    const r = await POST(
      req({ authorization: `Bearer ${"x".repeat(TOKEN.length)}` }),
    );
    expect(r.status).toBe(401);
  });

  it("401 quando a env não está configurada — nunca libera por ausência de segredo", async () => {
    delete process.env.BILLING_JOB_TOKEN;
    const r = await POST(req({ authorization: "Bearer qualquer" }));
    expect(r.status).toBe(401);
  });

  it("200 com o relatório completo", async () => {
    dubles.conciliarCiclos.mockResolvedValue({
      conferidos: 2,
      divergencias: [{ cicloId: "c1", classe: "pagamento_nao_conciliado" }],
      falhas: [],
      truncado: false,
    });
    dubles.conciliarVinculos.mockResolvedValue({
      conferidos: 1,
      divergencias: [
        { subscriptionId: "s1", classe: "vinculo_cancelado_no_gateway" },
      ],
      falhas: [],
      truncado: true,
    });
    dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue([
      { asaasEventId: "evt-1" },
    ]);

    const r = await POST(req({ authorization: `Bearer ${TOKEN}` }));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.ciclos.conferidos).toBe(2);
    expect(corpo.vinculos.truncado).toBe(true);
    expect(corpo.cobrancasSemCiclo).toHaveLength(1);
    // Soma das TRÊS fontes: as duas varreduras e a fila de eventos órfãos.
    expect(corpo.totalDivergencias).toBe(3);
  });

  it("a rota NUNCA escreve: nenhum módulo de mutação é importado", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(
      join(process.cwd(), "src/app/api/internal/billing/conciliar/route.ts"),
      "utf8",
    );
    expect(fonte).not.toMatch(
      /fecharCiclosVencendo|conciliarPagamentoDeCiclo|aplicarStatusProvider|reprocessarEventosPendentes/,
    );
  });

  it("falha de uma varredura não descarta a outra", async () => {
    dubles.conciliarVinculos.mockRejectedValue(new Error("gateway fora"));
    dubles.conciliarCiclos.mockResolvedValue({ ...vazio(), conferidos: 5 });
    const r = await POST(req({ authorization: `Bearer ${TOKEN}` }));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.ciclos.conferidos).toBe(5);
    expect(corpo.vinculosAbortado).toBe("gateway fora");
    expect(corpo.ok).toBe(false);
  });
});
