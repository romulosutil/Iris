import { describe, it, expect, vi, beforeEach } from "vitest";
import { startQueueWorkers, stopQueueWorkers } from "./worker";
import { ensureBossStarted, getBossInstance } from "./boss";
import { CRON_TICK_ASR } from "./config";
import { logger } from "@/lib/observabilidade/logger";

vi.mock("./boss", () => ({
  ensureBossStarted: vi.fn(),
  getBossInstance: vi.fn(),
}));

vi.mock("@/lib/observabilidade/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe("Queue Worker Supervisor", () => {
  const mockBoss = {
    work: vi.fn().mockResolvedValue("work-registered"),
    schedule: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    await stopQueueWorkers(); // zera isRunning antes de limpar os mocks
    vi.clearAllMocks();
    mockBoss.work.mockResolvedValue("work-registered");
    mockBoss.schedule.mockResolvedValue(undefined);
    (ensureBossStarted as never as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockBoss,
    );
    (getBossInstance as never as ReturnType<typeof vi.fn>).mockReturnValue(
      mockBoss,
    );
    process.env.ASR_JOB_URL = "http://iris-app:3000/api/internal/jobs/asr";
    process.env.ASR_JOB_TOKEN = "token-de-teste";
  });

  it("sobe como CONSUMIDOR e registra dlq + asr-transcrever", async () => {
    await startQueueWorkers();

    expect(ensureBossStarted).toHaveBeenCalledWith("consumidor");
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
    expect(logger.info).toHaveBeenCalledWith("queue.supervisor.iniciado");
  });

  it("não registra fila que o repositório não consome", async () => {
    await startQueueWorkers();

    const filas = mockBoss.work.mock.calls.map((c) => c[0]);
    // Oráculo de conjunto EXATO: uma fila definida em `config.ts` sem
    // consumidor aqui (ou vice-versa) é config morta que envelhece sozinha.
    expect(filas.sort()).toEqual(["asr-transcrever", "dlq"]);
  });

  it("agenda o tick periódico — a rede de segurança do heartbeat", async () => {
    await startQueueWorkers();

    // Sem cron, um clipe devolvido a `na_fila` por `app_asr_falhar(id, true)`
    // fica parado até alguém gravar outro ditado, e o heartbeat `asr` para de
    // avançar (alarme de 30 min em scripts/alarme-jobs.mjs).
    expect(mockBoss.schedule).toHaveBeenCalledWith(
      "asr-transcrever",
      CRON_TICK_ASR,
      { origem: "periodico" },
    );
  });

  it("recusa subir sem a env do disparo, antes de registrar consumidor", async () => {
    delete process.env.ASR_JOB_TOKEN;

    await expect(startQueueWorkers()).rejects.toThrow(/ASR_JOB_TOKEN/);
    // Fail-closed de verdade: nenhum job foi retirado da fila para ser
    // reprovado. Um worker que consome e falha 100% esvazia a fila na DLQ.
    expect(mockBoss.work).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "queue.supervisor.falha-ao-iniciar",
      expect.objectContaining({
        erro: expect.stringContaining("ASR_JOB_TOKEN"),
      }),
    );
  });

  it("não reinicializa se já estiver rodando (idempotência)", async () => {
    await startQueueWorkers();
    expect(ensureBossStarted).toHaveBeenCalledTimes(1);

    await startQueueWorkers();
    expect(ensureBossStarted).toHaveBeenCalledTimes(1);
  });

  it("para o supervisor e chama boss.stop com graceful e timeout", async () => {
    await startQueueWorkers();
    await stopQueueWorkers();

    expect(mockBoss.stop).toHaveBeenCalledWith({
      graceful: true,
      timeout: 5000,
    });
    expect(logger.info).toHaveBeenCalledWith("queue.supervisor.parado");
  });

  it("captura e registra erro se o start falhar", async () => {
    (
      ensureBossStarted as never as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Erro de conexão DB"));

    await expect(startQueueWorkers()).rejects.toThrow("Erro de conexão DB");
    expect(logger.error).toHaveBeenCalledWith(
      "queue.supervisor.falha-ao-iniciar",
      expect.objectContaining({ erro: "Erro de conexão DB" }),
    );
  });
});
