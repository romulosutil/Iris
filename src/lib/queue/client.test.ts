import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  enqueueJob,
  getBossInstance,
  opcoesDoBoss,
  resetBossInstance,
} from "./client";

const URL_FAKE = "postgres://iris_app:iris@localhost:5433/iris";

describe("Queue Client", () => {
  beforeEach(() => {
    resetBossInstance();
    process.env.DATABASE_URL = URL_FAKE;
  });

  it("recusa inicializar sem DATABASE_URL", () => {
    delete process.env.DATABASE_URL;
    expect(() => getBossInstance()).toThrow(/DATABASE_URL/);
  });

  it("o app é PRODUTOR: não liga supervise nem schedule", () => {
    // Manutenção e cron em toda réplica web seriam N cópias do mesmo trabalho
    // de banco disputando as mesmas linhas. Quem os roda é o worker.
    const produtor = opcoesDoBoss("produtor", URL_FAKE);
    expect(produtor.supervise).toBe(false);
    expect(produtor.schedule).toBe(false);

    const consumidor = opcoesDoBoss("consumidor", URL_FAKE);
    expect(consumidor.supervise).toBe(true);
    expect(consumidor.schedule).toBe(true);
  });

  it("nunca deixa o pg-boss tentar DDL em runtime", () => {
    // `app_role` é NOBYPASSRLS e sem CREATE: com `migrate: true` o boss
    // tentaria `CREATE SCHEMA` no boot e o processo morreria.
    expect(opcoesDoBoss("produtor", URL_FAKE).migrate).toBe(false);
    expect(opcoesDoBoss("consumidor", URL_FAKE).migrate).toBe(false);
  });

  it("recusa o mesmo processo pedindo produtor e consumidor", () => {
    getBossInstance("produtor");
    expect(() => getBossInstance("consumidor")).toThrow(/produtor/);
  });

  it("enfileira job passando singletonKey e deadLetter corretos", async () => {
    const boss = getBossInstance();
    vi.spyOn(boss, "start").mockResolvedValue(undefined as never);
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-123");

    const jobId = await enqueueJob(
      "asr-transcrever",
      { origem: "lote", loteId: "lote-uuid", sessionId: "sess-uuid" },
      { singletonKey: "lote-uuid" },
    );

    expect(jobId).toBe("job-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "asr-transcrever",
      expect.objectContaining({ origem: "lote", loteId: "lote-uuid" }),
      expect.objectContaining({
        singletonKey: "lote-uuid",
        retryLimit: 3,
        retryBackoff: true,
        expireInSeconds: 300,
        deadLetter: "dlq",
      }),
    );
  });

  it("inicia o boss antes de enviar, sem depender de mock em produção", async () => {
    const boss = getBossInstance();
    const startSpy = vi
      .spyOn(boss, "start")
      .mockResolvedValue(undefined as never);
    vi.spyOn(boss, "send").mockResolvedValue("job-1");

    await enqueueJob("asr-transcrever", { origem: "periodico" });
    await enqueueJob("asr-transcrever", { origem: "periodico" });

    // Idempotente por processo: dois enfileiramentos, um `start`.
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("suporta transação Drizzle via fromDrizzle", async () => {
    const boss = getBossInstance();
    vi.spyOn(boss, "start").mockResolvedValue(undefined as never);
    const sendSpy = vi.spyOn(boss, "send").mockResolvedValue("job-tx-123");

    const mockTx = { execute: vi.fn().mockResolvedValue({ rows: [] }) };

    const jobId = await enqueueJob(
      "asr-transcrever",
      { origem: "lote", loteId: "lote-uuid" },
      { singletonKey: "lote-uuid", tx: mockTx },
    );

    expect(jobId).toBe("job-tx-123");
    expect(sendSpy).toHaveBeenCalledWith(
      "asr-transcrever",
      expect.any(Object),
      expect.objectContaining({
        singletonKey: "lote-uuid",
        db: expect.any(Object),
      }),
    );
  });
});
