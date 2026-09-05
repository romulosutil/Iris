import { PgBoss, fromDrizzle } from "pg-boss";
import { sql } from "drizzle-orm";
import { QUEUE_DEFINITIONS } from "./config";
import type { EnqueueOptions, QueueJobMap, QueueName } from "./types";

let bossInstance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export function getBossInstance(): PgBoss {
  if (bossInstance) return bossInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada para inicialização da fila");
  }

  bossInstance = new PgBoss({
    connectionString,
    schema: "pgboss",
    supervise: true,
    migrate: false, // Schema e tabelas gerenciados pela migração 0154 do banco
    application_name: "iris_job_worker",
  });

  return bossInstance;
}

export async function ensureBossStarted(): Promise<PgBoss> {
  const boss = getBossInstance();
  if (!startPromise) {
    startPromise = (async () => {
      await boss.start();
      return boss;
    })().catch((err) => {
      startPromise = null;
      throw err;
    });
  }
  return await startPromise;
}

export function resetBossInstance(): void {
  bossInstance = null;
  startPromise = null;
}

/**
 * Enfileira um job com garantia transacional (se `tx` for fornecido via Drizzle)
 * e herda configurações de concorrência, retentativas e DLQ da definição da fila.
 */
export async function enqueueJob<K extends QueueName>(
  queueName: K,
  data: QueueJobMap[K],
  options: EnqueueOptions = {},
): Promise<string | null> {
  const boss = getBossInstance();

  // Em runtime real / integração, garante que o PgBoss foi iniciado e que as filas existem
  if (!(boss.send as any)?.mock) {
    await ensureBossStarted();
  }

  const def = QUEUE_DEFINITIONS[queueName];

  const sendOptions: Record<string, unknown> = {};

  const retryLimit = options.retryLimit ?? def.retryLimit;
  if (retryLimit !== undefined) sendOptions.retryLimit = retryLimit;

  const retryBackoff = options.retryBackoff ?? def.retryBackoff;
  if (retryBackoff !== undefined) sendOptions.retryBackoff = retryBackoff;

  const retryDelay = options.retryDelay ?? def.retryDelay;
  if (retryDelay !== undefined) sendOptions.retryDelay = retryDelay;

  const expireInSeconds = options.expireInSeconds ?? def.expireInSeconds;
  if (expireInSeconds !== undefined)
    sendOptions.expireInSeconds = expireInSeconds;

  const deadLetter = options.deadLetter ?? def.deadLetter;
  if (deadLetter !== undefined) sendOptions.deadLetter = deadLetter;

  if (options.singletonKey !== undefined)
    sendOptions.singletonKey = options.singletonKey;
  if (options.priority !== undefined) sendOptions.priority = options.priority;
  if (options.startAfter !== undefined)
    sendOptions.startAfter = options.startAfter;

  if (options.tx) {
    sendOptions.db = fromDrizzle(options.tx, sql);
  }

  return await boss.send(queueName, data as object, sendOptions as any);
}
