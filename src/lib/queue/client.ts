import { fromDrizzle } from "pg-boss";
import { sql } from "drizzle-orm";
import { QUEUE_DEFINITIONS } from "./config";
import { ensureBossStarted, getBossInstance } from "./boss";
import type { EnqueueOptions, QueueJobMap, QueueName } from "./types";

export {
  getBossInstance,
  ensureBossStarted,
  resetBossInstance,
  opcoesDoBoss,
} from "./boss";

/**
 * Enfileira um job herdando retentativas, backoff, expiração e DLQ da
 * definição da fila.
 *
 * Com `tx`, o INSERT do job vai DENTRO da transação Drizzle da regra de
 * negócio (`fromDrizzle`): se a transação que promove os clipes a `na_fila`
 * sofrer rollback, o job nunca existe — não há job fantasma apontando para
 * estado que não foi commitado.
 */
export async function enqueueJob<K extends QueueName>(
  queueName: K,
  data: QueueJobMap[K],
  options: EnqueueOptions = {},
): Promise<string | null> {
  // Incondicional: `boss.send` precisa do pool vivo mesmo quando o INSERT vai
  // pela transação do chamador (o boss ainda resolve a fila e as opções).
  // `ensureBossStarted` é idempotente por processo.
  const boss = await ensureBossStarted();

  const def = QUEUE_DEFINITIONS[queueName];

  const sendOptions: Record<string, unknown> = {
    retryLimit: options.retryLimit ?? def.retryLimit,
    retryBackoff: options.retryBackoff ?? def.retryBackoff,
    retryDelay: options.retryDelay ?? def.retryDelay,
    expireInSeconds: options.expireInSeconds ?? def.expireInSeconds,
  };

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

  return await boss.send(queueName, data as object, sendOptions);
}
