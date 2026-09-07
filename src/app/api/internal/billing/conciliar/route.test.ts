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
  TETO_CONCILIACAO_POR_PASSADA: 100,
}));
vi.mock("@/lib/billing/erro-aplicacao", () => ({
  listarCobrancasDeCicloNaoConciliadas:
    dubles.listarCobrancasDeCicloNaoConciliadas,
}));

/**
 * #636 (mesmo defeito da #609) — `registrarHeartbeat` roda
 * `sql\`SELECT app_job_heartbeat_gravar(…)\`` contra o Postgres de verdade
 * (`@/db/client`). Sem este dublê, o teste abre conexão TCP com o banco local
 * e o veredito passa a depender da latência dele.
 *
 * O dublê é do MÓDULO, não da conexão: `detalheSemPii` segue real (é pura e
 * não toca banco) porque é o texto que ela produz que este arquivo afirma no
 * `detalhe` do heartbeat.
 */
const heartbeat = vi.hoisted(() => ({ registrarHeartbeat: vi.fn() }));
vi.mock("@/lib/jobs/heartbeat", async (original) => ({
  ...(await original<typeof import("@/lib/jobs/heartbeat")>()),
  registrarHeartbeat: heartbeat.registrarHeartbeat,
}));

const { POST } = await import("./route");

const TOKEN = "token-de-teste-375";

function req(headers: Record<string, string> = {}, corpo?: unknown): Request {
  return new Request("https://exemplo.test/api/internal/billing/conciliar", {
    method: "POST",
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function vazio() {
  return { conferidos: 0, divergencias: [], falhas: [], truncado: false };
}

/**
 * #531 (S-03): o discriminador de etapa vai no CORPO da resposta, e o script
 * que dispara o job loga o corpo no stdout do container (painel do Easypanel,
 * em HTTP puro). Ele pode nomear o tipo do erro e a correlacao — nunca a
 * `message`, que num `DrizzleQueryError` e "Failed query: <sql> params: <os
 * valores vinculados>".
 */
function esperarDiagnosticoSemMensagem(valor: unknown, mensagem: string): void {
  expect(valor).toMatch(/^Error correlacao=[0-9a-f]{8}$/);
  expect(String(valor)).not.toContain(mensagem);
}

describe("POST /api/internal/billing/conciliar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_JOB_TOKEN = TOKEN;
    dubles.conciliarCiclos.mockResolvedValue(vazio());
    dubles.conciliarVinculos.mockResolvedValue(vazio());
    dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue([]);
    // O contrato real: `registrarHeartbeat` NUNCA lança (o próprio módulo
    // engole a falha e devolve `false`). O dublê resolve para manter esse
    // contrato.
    heartbeat.registrarHeartbeat.mockResolvedValue(true);
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
    esperarDiagnosticoSemMensagem(corpo.vinculosAbortado, "gateway fora");
    expect(corpo.ok).toBe(false);
  });

  it("cobrancasSemCicloTruncado é false quando cabe no limite", async () => {
    dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue([
      { asaasEventId: "evt-1" },
    ]);
    const r = await POST(req({ authorization: `Bearer ${TOKEN}` }));
    const corpo = await r.json();
    expect(corpo.cobrancasSemCicloTruncado).toBe(false);
    expect(corpo.cobrancasSemCiclo).toHaveLength(1);
  });

  it("cobrancasSemCicloTruncado é true e a lista corta em 100 quando o teto estoura", async () => {
    const lote = Array.from({ length: 101 }, (_, i) => ({
      asaasEventId: `evt-${i}`,
    }));
    dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue(lote);
    const r = await POST(req({ authorization: `Bearer ${TOKEN}` }));
    const corpo = await r.json();
    expect(corpo.cobrancasSemCicloTruncado).toBe(true);
    expect(corpo.cobrancasSemCiclo).toHaveLength(100);
    expect(dubles.listarCobrancasDeCicloNaoConciliadas).toHaveBeenCalledWith(
      101,
      0,
    );
  });

  it("paginação (achado BLOCKING #468): offset do corpo chega intacto em cada braço", async () => {
    await POST(
      req({ authorization: `Bearer ${TOKEN}` }, { ciclosOffset: 100 }),
    );
    expect(dubles.conciliarCiclos).toHaveBeenCalledWith({
      limite: 100,
      offset: 100,
    });
    expect(dubles.conciliarVinculos).toHaveBeenCalledWith({
      limite: 100,
      offset: 0,
    });
  });

  it("limite: 0 pula o braço sem gastar chamada nova ao Asaas via query com offset novo", async () => {
    await POST(
      req(
        { authorization: `Bearer ${TOKEN}` },
        { vinculosLimite: 0, cobrancasSemCicloLimite: 0 },
      ),
    );
    expect(dubles.conciliarVinculos).toHaveBeenCalledWith({
      limite: 0,
      offset: 0,
    });
    expect(dubles.listarCobrancasDeCicloNaoConciliadas).not.toHaveBeenCalled();
  });

  it("corpo ausente ou inválido não quebra a rota — pagina do zero", async () => {
    const r = await POST(req({ authorization: `Bearer ${TOKEN}` }));
    expect(r.status).toBe(200);
    expect(dubles.conciliarCiclos).toHaveBeenCalledWith({
      limite: 100,
      offset: 0,
    });
  });

  /**
   * #636 — o heartbeat era EXECUTADO por todos os testes deste arquivo
   * (contra o banco de verdade) e AFIRMADO por nenhum. A chamada podia sumir
   * da rota sem um teste ficar vermelho, e o que ela deixaria de existir é o
   * sinal de vida que `scripts/alarme-jobs.mjs` lê para saber se a
   * conciliação rodou.
   */
  describe("heartbeat (#636)", () => {
    it("grava ok:true com as contagens quando a passada correu limpa", async () => {
      dubles.conciliarCiclos.mockResolvedValue({
        conferidos: 2,
        divergencias: [{ cicloId: "c1", classe: "pagamento_nao_conciliado" }],
        falhas: [],
        truncado: false,
      });
      dubles.listarCobrancasDeCicloNaoConciliadas.mockResolvedValue([
        { asaasEventId: "evt-1" },
      ]);

      await POST(req({ authorization: `Bearer ${TOKEN}` }));

      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledTimes(1);
      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
        "conciliacao",
        true,
        // `detalheSemPii` é o real: só contagem e booleano chegam ao banco,
        // nunca id de cobrança ou clínica.
        "totalDivergencias=2 abortou=false",
      );
    });

    it("grava ok:false quando uma varredura aborta, sem derrubar a gravação", async () => {
      dubles.conciliarVinculos.mockRejectedValue(new Error("gateway fora"));

      await POST(req({ authorization: `Bearer ${TOKEN}` }));

      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
        "conciliacao",
        false,
        "totalDivergencias=0 abortou=true",
      );
    });

    it("uma passada recusada na autorização não carimba sinal de vida", async () => {
      await POST(req());

      expect(heartbeat.registrarHeartbeat).not.toHaveBeenCalled();
    });
  });
});
