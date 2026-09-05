import { PgBoss, fromDrizzle } from "pg-boss";
import { sql } from "drizzle-orm";
import { QUEUE_DEFINITIONS } from "./config";
import type { EnqueueOptions, QueueJobMap, QueueName } from "./types";

let bossInstance: PgBoss | null = null;

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
    migrate: false, // Migração gerenciada via DDL controlado pelo pipeline
    application_name: "iris_job_worker",
  });

  return bossInstance;
}

export function resetBossInstance(): void {
  bossInstance = null;
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
  const def = QUEUE_DEFINITIONS[queueName];

  const sendOptions: Record<string, unknown> = {
    retryLimit: options.retryLimit ?? def.retryLimit,
    retryBackoff: options.retryBackoff ?? def.retryBackoff,
    retryDelay: options.retryDelay ?? def.retryDelay,
    expireInSeconds: options.expireInSeconds ?? def.expireInSeconds,
    deadLetter: options.deadLetter ?? def.deadLetter,
    singletonKey: options.singletonKey,
    priority: options.priority,
    startAfter: options.startAfter,
  };

  if (options.tx) {
    sendOptions.db = fromDrizzle(options.tx, sql);
  }

  return await boss.send(queueName, data as object, sendOptions as any);
}
