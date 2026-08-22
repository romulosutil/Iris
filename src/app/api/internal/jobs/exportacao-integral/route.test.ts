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
