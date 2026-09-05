import { getBossInstance } from "./client";
import { QUEUE_DEFINITIONS } from "./config";
import { processAsrJob } from "./handlers/asr";
import { processLlmJob } from "./handlers/llm";
import { processDlqJob } from "./handlers/dlq";
import { logger } from "@/lib/observabilidade/logger";

let isRunning = false;

export async function startQueueWorkers(): Promise<void> {
  if (isRunning) return;
  const boss = getBossInstance();

  try {
    await boss.start();
    logger.info("queue.supervisor.iniciado");

    // Registra fila DLQ
    await boss.work(
      "dlq",
      {
        localConcurrency: QUEUE_DEFINITIONS.dlq.concurrency,
        includeMetadata: true,
      },
      processDlqJob as any,
    );

    // Registra worker ASR (concorrência 1)
    await boss.work(
      "asr-transcrever",
      {
        localConcurrency: QUEUE_DEFINITIONS["asr-transcrever"].concurrency,
        batchSize: 1,
      },
      processAsrJob as any,
    );

    // Registra worker LLM (concorrência 5)
    await boss.work(
      "llm-extracao",
      {
        localConcurrency: QUEUE_DEFINITIONS["llm-extracao"].concurrency,
        batchSize: 1,
      },
      processLlmJob as any,
    );

    isRunning = true;
  } catch (err) {
    logger.error("queue.supervisor.falha-ao-iniciar", {
      erro: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function stopQueueWorkers(): Promise<void> {
  if (!isRunning) return;
  const boss = getBossInstance();
  await boss.stop({ graceful: true, timeout: 5000 });
  isRunning = false;
  logger.info("queue.supervisor.parado");
}
