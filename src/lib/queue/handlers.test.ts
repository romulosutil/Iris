import { describe, expect, it, vi } from "vitest";
import { processDlqJob } from "./handlers/dlq";
import { processAsrJob } from "./handlers/asr";
import { processLlmJob } from "./handlers/llm";
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

describe("ASR & LLM Job Handlers", () => {
  it("processAsrJob respeita cancelamento do AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort(); // Já abortado

    const job = {
      id: "asr-job-1",
      name: "asr-transcrever",
      data: { loteId: "lote-1", sessionId: "sess-1", clinicId: "clin-1" },
      expireInSeconds: 300,
      heartbeatSeconds: 30,
      signal: controller.signal,
    };

    await expect(processAsrJob([job as any])).rejects.toThrow("aborted");
  });

  it("processAsrJob executa com sucesso quando não abortado", async () => {
    const controller = new AbortController();

    const job = {
      id: "asr-job-2",
      name: "asr-transcrever",
      data: { loteId: "lote-2", sessionId: "sess-2", clinicId: "clin-2" },
      expireInSeconds: 300,
      heartbeatSeconds: 30,
      signal: controller.signal,
    };

    await expect(processAsrJob([job as any])).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      "queue.asr.iniciando",
      expect.objectContaining({
        loteId: "lote-2",
        sessionId: "sess-2",
        clinicId: "clin-2",
        jobId: "asr-job-2",
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "queue.asr.concluido",
      expect.objectContaining({
        loteId: "lote-2",
        sessionId: "sess-2",
        jobId: "asr-job-2",
      }),
    );
  });

  it("processLlmJob aborta gracefully se sinal estiver cancelado", async () => {
    const controller = new AbortController();
    controller.abort();

    const job = {
      id: "llm-job-1",
      name: "llm-extracao",
      data: { sessionId: "sess-1", clinicId: "clin-1" },
      expireInSeconds: 120,
      heartbeatSeconds: 20,
      signal: controller.signal,
    };

    await expect(processLlmJob([job as any])).rejects.toThrow("aborted");
  });

  it("processLlmJob executa com sucesso quando não abortado", async () => {
    const controller = new AbortController();

    const job = {
      id: "llm-job-2",
      name: "llm-extracao",
      data: { sessionId: "sess-2", clinicId: "clin-2" },
      expireInSeconds: 120,
      heartbeatSeconds: 20,
      signal: controller.signal,
    };

    await expect(processLlmJob([job as any])).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      "queue.llm.iniciando",
      expect.objectContaining({
        sessionId: "sess-2",
        clinicId: "clin-2",
        jobId: "llm-job-2",
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "queue.llm.concluido",
      expect.objectContaining({ sessionId: "sess-2", jobId: "llm-job-2" }),
    );
  });
});
