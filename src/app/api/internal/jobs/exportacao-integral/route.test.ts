import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import * as motor from "@/lib/export/acervo/motor";

vi.mock("@/lib/export/acervo/motor", () => ({
  processarProximo: vi.fn(),
  expirarVencidos: vi.fn(),
}));

/**
 * #636 (mesmo defeito da #609) — `registrarHeartbeat` roda
 * `sql\`SELECT app_job_heartbeat_gravar(…)\`` contra o Postgres de verdade
 * (`@/db/client`). Sem este dublê, o teste abre conexão TCP com o banco local
 * e o veredito passa a depender da latência dele.
 *
 * O dublê é do MÓDULO, não da conexão: `detalheSemPii`/`detalheDoErro` seguem
 * reais (são puras e não tocam banco) porque é o texto que produzem que este
 * arquivo afirma no `detalhe` do heartbeat.
 */
const heartbeat = vi.hoisted(() => ({ registrarHeartbeat: vi.fn() }));
vi.mock("@/lib/jobs/heartbeat", async (original) => ({
  ...(await original<typeof import("@/lib/jobs/heartbeat")>()),
  registrarHeartbeat: heartbeat.registrarHeartbeat,
}));

describe("POST /api/internal/jobs/exportacao-integral (Task T5)", () => {
  const originalEnv = process.env.EXPORT_JOB_TOKEN;

  beforeEach(() => {
    process.env.EXPORT_JOB_TOKEN = "token-secreto-export-123";
    vi.clearAllMocks();
    // O contrato real: `registrarHeartbeat` NUNCA lança (o próprio módulo
    // engole a falha e devolve `false`). O dublê resolve para manter esse
    // contrato.
    heartbeat.registrarHeartbeat.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env.EXPORT_JOB_TOKEN = originalEnv;
  });

  it("recusa requisições sem header de autorização (401)", async () => {
    const req = new Request(
      "http://localhost/api/internal/jobs/exportacao-integral",
      {
        method: "POST",
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("não autorizado");
  });

  it("NÃO aceita BILLING_JOB_TOKEN nem INTERNAL_JOB_TOKEN como fallback (A-05, #530)", async () => {
    // Antes: `EXPORT_JOB_TOKEN ?? INTERNAL_JOB_TOKEN ?? BILLING_JOB_TOKEN`.
    // Vazar o segredo do billing dava poder sobre a exportação do acervo.
    // Agora só `EXPORT_JOB_TOKEN` autoriza; sem ele, recusa tudo.
    delete process.env.EXPORT_JOB_TOKEN;
    vi.stubEnv("BILLING_JOB_TOKEN", "token-do-billing-que-nao-vale-aqui");
    vi.stubEnv("INTERNAL_JOB_TOKEN", "token-interno-que-nao-existe-mais");
    vi.mocked(motor.processarProximo).mockResolvedValue({ processado: false });
    vi.mocked(motor.expirarVencidos).mockResolvedValue({ expirados: 0 });

    for (const token of [
      "token-do-billing-que-nao-vale-aqui",
      "token-interno-que-nao-existe-mais",
    ]) {
      const res = await POST(
        new Request("http://localhost/api/internal/jobs/exportacao-integral", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status, `token ${token} não pode autorizar`).toBe(401);
    }
    expect(motor.processarProximo).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("recusa requisições com token inválido (401)", async () => {
    const req = new Request(
      "http://localhost/api/internal/jobs/exportacao-integral",
      {
        method: "POST",
        headers: {
          authorization: "Bearer token-errado",
        },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("responde ok:false + 500 quando algum bundle `falhou`, sem esconder o resto (Q-07, #530)", async () => {
    vi.mocked(motor.processarProximo)
      .mockResolvedValueOnce({
        processado: true,
        bundleId: "bundle-ruim",
        status: "falhou",
        erro: "storage fora",
      })
      .mockResolvedValueOnce({
        processado: true,
        bundleId: "bundle-bom",
        status: "pronto",
      })
      .mockResolvedValueOnce({ processado: false });
    vi.mocked(motor.expirarVencidos).mockResolvedValueOnce({ expirados: 1 });

    const res = await POST(
      new Request("http://localhost/api/internal/jobs/exportacao-integral", {
        method: "POST",
        headers: { authorization: "Bearer token-secreto-export-123" },
      }),
    );

    // O "exit 0 mentiroso" da #105: 200 {ok:true} com todo bundle em `falhou`
    // deixava o acervo pendente para sempre sem sinal no job.
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.bundlesFalhos).toBe(1);
    // O corpo continua inteiro: o job só registra este JSON.
    expect(body.totalProcessados).toBe(2);
    expect(body.processados).toHaveLength(2);
    expect(body.processados[0]).toMatchObject({
      bundleId: "bundle-ruim",
      status: "falhou",
      erro: "storage fora",
    });
    // A expiração de bundles vencidos ainda roda: falha de UM bundle não
    // pode segurar a retenção dos outros.
    expect(motor.expirarVencidos).toHaveBeenCalledTimes(1);
    expect(body.expirados).toBe(1);
  });

  it("processa fila e expirações quando autorizado (200)", async () => {
    vi.mocked(motor.processarProximo)
      .mockResolvedValueOnce({
        processado: true,
        bundleId: "bundle-1",
        status: "pronto",
      })
      .mockResolvedValueOnce({
        processado: false,
      });

    vi.mocked(motor.expirarVencidos).mockResolvedValueOnce({
      expirados: 2,
    });

    const req = new Request(
      "http://localhost/api/internal/jobs/exportacao-integral",
      {
        method: "POST",
        headers: {
          authorization: "Bearer token-secreto-export-123",
        },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.totalProcessados).toBe(1);
    expect(body.expirados).toBe(2);
    expect(body.processados[0].bundleId).toBe("bundle-1");
  });

  /**
   * #636 — o heartbeat era EXECUTADO por todos os testes deste arquivo
   * (contra o banco de verdade) e AFIRMADO por nenhum. A chamada podia sumir
   * da rota sem um teste ficar vermelho, e o que ela deixaria de existir é o
   * sinal de vida que `scripts/alarme-jobs.mjs` lê para saber se a
   * exportação rodou.
   */
  describe("heartbeat (#636)", () => {
    it("grava ok:true com as contagens quando a passada correu limpa", async () => {
      vi.mocked(motor.processarProximo)
        .mockResolvedValueOnce({
          processado: true,
          bundleId: "bundle-1",
          status: "pronto",
        })
        .mockResolvedValueOnce({ processado: false });
      vi.mocked(motor.expirarVencidos).mockResolvedValueOnce({ expirados: 2 });

      await POST(
        new Request("http://localhost/api/internal/jobs/exportacao-integral", {
          method: "POST",
          headers: { authorization: "Bearer token-secreto-export-123" },
        }),
      );

      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledTimes(1);
      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
        "exportacao",
        true,
        // `detalheSemPii` é o real: só contagem chega ao banco, nunca
        // `bundleId` nem `erro`.
        "processados=1 bundlesFalhos=0 expirados=2",
      );
    });

    it("grava ok:false quando um bundle falhou, sem derrubar a gravação (Q-07)", async () => {
      vi.mocked(motor.processarProximo)
        .mockResolvedValueOnce({
          processado: true,
          bundleId: "bundle-ruim",
          status: "falhou",
          erro: "storage fora",
        })
        .mockResolvedValueOnce({ processado: false });
      vi.mocked(motor.expirarVencidos).mockResolvedValueOnce({ expirados: 0 });

      await POST(
        new Request("http://localhost/api/internal/jobs/exportacao-integral", {
          method: "POST",
          headers: { authorization: "Bearer token-secreto-export-123" },
        }),
      );

      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
        "exportacao",
        false,
        "processados=1 bundlesFalhos=1 expirados=0",
      );
    });

    it("grava ok:false com o detalhe do erro quando a passada aborta inteira", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(motor.processarProximo).mockRejectedValueOnce(
        new Error("connection terminated unexpectedly"),
      );

      await POST(
        new Request("http://localhost/api/internal/jobs/exportacao-integral", {
          method: "POST",
          headers: { authorization: "Bearer token-secreto-export-123" },
        }),
      );

      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledTimes(1);
      // `detalheDoErro` real: classe do erro, nunca a `message` (que num
      // `DrizzleQueryError` é o SQL com os params).
      expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
        "exportacao",
        false,
        "erro=Error",
      );
    });

    it("uma passada recusada na autorização não carimba sinal de vida", async () => {
      await POST(
        new Request(
          "http://localhost/api/internal/jobs/exportacao-integral",
          { method: "POST" },
        ),
      );

      expect(heartbeat.registrarHeartbeat).not.toHaveBeenCalled();
    });
  });
});
