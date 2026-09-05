import type { QueueName } from "./types";

export type QueueDefinition = {
  name: QueueName;
  concurrency: number;
  retryLimit: number;
  retryBackoff: boolean;
  retryDelay: number;
  expireInSeconds: number;
  heartbeatSeconds?: number;
  deadLetter?: QueueName;
};

export const QUEUE_DEFINITIONS: Record<QueueName, QueueDefinition> = {
  "asr-transcrever": {
    name: "asr-transcrever",
    // Teto estrito de 1 para não sobrecarregar o modelo Whisper / GPU VPS
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 5,
    expireInSeconds: 300,
    heartbeatSeconds: 30,
    deadLetter: "dlq",
  },
  "llm-extracao": {
    name: "llm-extracao",
    // Teto de 5 jobs simultâneos para respeitar rate-limit da API do LLM
    concurrency: 5,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 2,
    expireInSeconds: 120,
    heartbeatSeconds: 20,
    deadLetter: "dlq",
  },
  "billing-reconciliar": {
    name: "billing-reconciliar",
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 10,
    expireInSeconds: 300,
    deadLetter: "dlq",
  },
  "expurgo-audit-log": {
    name: "expurgo-audit-log",
    concurrency: 1,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 30,
    expireInSeconds: 600,
    deadLetter: "dlq",
  },
  dlq: {
    name: "dlq",
    concurrency: 5,
    retryLimit: 1,
    retryBackoff: false,
    retryDelay: 0,
    expireInSeconds: 60,
  },
};
