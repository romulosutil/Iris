import { describe, expect, it, vi, beforeEach } from "vitest";
import { enqueueJob, getBossInstance, resetBossInstance } from "./client";

describe("Queue Client", () => {
  beforeEach(() => {
    resetBossInstance();
  });

  it("permite obter a instância configurada do PgBoss", () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    expect(boss).toBeDefined();
  });

  it("enfileira job passando singletonKey e deadLetter corretos", async () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-123");

    const jobId = await enqueueJob(
      "asr-transcrever",
      {
        loteId: "lote-uuid",
        sessionId: "sess-uuid",
        clinicId: "clin-uuid",
      },
      { singletonKey: "lote-uuid" },
    );

    expect(jobId).toBe("job-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "asr-transcrever",
      expect.objectContaining({
        loteId: "lote-uuid",
      }),
      expect.objectContaining({
        singletonKey: "lote-uuid",
        retryLimit: 3,
        retryBackoff: true,
        deadLetter: "dlq",
      }),
    );
  });

  it("suporta transação Drizzle via fromDrizzle", async () => {
    process.env.DATABASE_URL = "postgres://iris_app:iris@localhost:5433/iris";
    const boss = getBossInstance();
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-tx-123");

    const mockTx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const jobId = await enqueueJob(
      "llm-extracao",
      {
        sessionId: "sess-uuid",
        clinicId: "clin-uuid",
      },
      {
        singletonKey: "sess-uuid",
        tx: mockTx as any,
      },
    );

    expect(jobId).toBe("job-tx-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "llm-extracao",
      expect.any(Object),
      expect.objectContaining({
        singletonKey: "sess-uuid",
        db: expect.any(Object),
      }),
    );
  });
});
