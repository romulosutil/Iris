import { describe, it, expect, vi, beforeEach } from "vitest";
import { startQueueWorkers, stopQueueWorkers } from "./worker";
import { getBossInstance } from "./client";
import { logger } from "@/lib/observabilidade/logger";

vi.mock("./client", () => ({
  getBossInstance: vi.fn(),
}));

vi.mock("@/lib/observabilidade/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Queue Worker Supervisor", () => {
  const mockBoss = {
    start: vi.fn().mockResolvedValue("boss-started"),
    work: vi.fn().mockResolvedValue("work-registered"),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (getBossInstance as any).mockReturnValue(mockBoss);
    await stopQueueWorkers(); // Garante estado isRunning = false
  });

  it("inicializa o boss e registra workers para dlq, asr-transcrever e llm-extracao", async () => {
    await startQueueWorkers();

    expect(mockBoss.start).toHaveBeenCalledTimes(1);
    expect(mockBoss.work).toHaveBeenCalledWith(
      "dlq",
      expect.objectContaining({ localConcurrency: 5, includeMetadata: true }),
      expect.any(Function),
    );
    expect(mockBoss.work).toHaveBeenCalledWith(
      "asr-transcrever",
      expect.objectContaining({ localConcurrency: 1, batchSize: 1 }),
      expect.any(Function),
    );
    expect(mockBoss.work).toHaveBeenCalledWith(
      "llm-extracao",
      expect.objectContaining({ localConcurrency: 5, batchSize: 1 }),
      expect.any(Function),
    );
    expect(logger.info).toHaveBeenCalledWith("queue.supervisor.iniciado");
  });

  it("não reinicializa se já estiver rodando (idempotência)", async () => {
    await startQueueWorkers();
    expect(mockBoss.start).toHaveBeenCalledTimes(1);

    await startQueueWorkers();
    expect(mockBoss.start).toHaveBeenCalledTimes(1);
  });

  it("para o supervisor e chama boss.stop com graceful e timeout", async () => {
    await startQueueWorkers();
    await stopQueueWorkers();

    expect(mockBoss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 5000 });
    expect(logger.info).toHaveBeenCalledWith("queue.supervisor.parado");
  });

  it("captura e registra erro se boss.start falhar", async () => {
    mockBoss.start.mockRejectedValueOnce(new Error("Erro de conexão DB"));

    await expect(startQueueWorkers()).rejects.toThrow("Erro de conexão DB");
    expect(logger.error).toHaveBeenCalledWith(
      "queue.supervisor.falha-ao-iniciar",
      expect.objectContaining({ erro: "Erro de conexão DB" }),
    );
  });
});
