import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import * as motor from "@/lib/export/acervo/motor";

vi.mock("@/lib/export/acervo/motor", () => ({
  processarProximo: vi.fn(),
  expirarVencidos: vi.fn(),
}));

describe("POST /api/internal/jobs/exportacao-integral (Task T5)", () => {
  const originalEnv = process.env.EXPORT_JOB_TOKEN;

  beforeEach(() => {
    process.env.EXPORT_JOB_TOKEN = "token-secreto-export-123";
    vi.clearAllMocks();
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
});
