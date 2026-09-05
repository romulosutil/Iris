import { describe, expect, it, vi } from "vitest";
import { processDlqJob } from "./handlers/dlq";
import { logger } from "@/lib/observabilidade/logger";

vi.mock("@/lib/observabilidade/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("DLQ Handler", () => {
  it("loga falha crítica de job de forma estruturada sem expor PII", async () => {
    const mockJob = {
      id: "job-dlq-1",
      name: "dlq",
      data: {
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        clinicId: "123e4567-e89b-12d3-a456-426614174001",
        textoSensivelClinico: "Paciente apresentou crise severa...",
      },
      sourceName: "llm-extracao",
      sourceId: "job-orig-456",
      sourceRetryCount: 3,
      expireInSeconds: 60,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    };

    await processDlqJob([mockJob as any]);

    expect(logger.error).toHaveBeenCalledWith(
      "queue.dlq-job-falhou-definitivamente",
      expect.objectContaining({
        jobId: "job-dlq-1",
        sourceQueue: "llm-extracao",
        sourceJobId: "job-orig-456",
        retryCount: 3,
      }),
    );

    // Garante que o texto da nota clínica não vazou no log
    const logCall = vi.mocked(logger.error).mock.calls[0];
    expect(logCall).toBeDefined();
    const logPayload = JSON.stringify(logCall?.[1]);
    expect(logPayload).not.toContain("Paciente apresentou crise");
  });
});
