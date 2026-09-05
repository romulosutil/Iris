import { ensureBossStarted, getBossInstance } from "./boss";
import { CRON_TICK_ASR, QUEUE_DEFINITIONS } from "./config";
import { processAsrJob, lerConfigDisparoAsr } from "./handlers/asr";
import { processDlqJob } from "./handlers/dlq";
import { logger } from "@/lib/observabilidade/logger";

let isRunning = false;

/**
 * Supervisor das filas — roda no processo do worker
 * (`scripts/queue-worker.ts`), nunca no processo que serve HTTP.
 */
export async function startQueueWorkers(): Promise<void> {
  if (isRunning) return;

  try {
    // FAIL-CLOSED ANTES DE REGISTRAR QUALQUER CONSUMIDOR (mesma disciplina do
    // laço antigo, que validava a env antes do `while`): sem `ASR_JOB_URL` /
    // `ASR_JOB_TOKEN` todo tick falha, queima as 3 tentativas e cai na DLQ. Um
    // worker que sobe verde e reprova 100% dos jobs é indistinguível de um
    // worker que está trabalhando — quem descobre é a fila crescendo. Deixar o
    // processo morrer no boot faz o Easypanel mostrar o crash loop.
    // Memória `asr-worker-role-requisito-de-deploy`: CI verde não prova env de
    // produção; o fail-closed é o que prova.
    lerConfigDisparoAsr();

    const boss = await ensureBossStarted("consumidor");
    logger.info("queue.supervisor.iniciado");

    await boss.work(
      "dlq",
      {
        localConcurrency: QUEUE_DEFINITIONS.dlq.concurrency,
        includeMetadata: true,
      },
      processDlqJob as never,
    );

    await boss.work(
      "asr-transcrever",
      {
        localConcurrency: QUEUE_DEFINITIONS["asr-transcrever"].concurrency,
        batchSize: 1,
      },
      processAsrJob as never,
    );

    // Rede de segurança: clipe devolvido a `na_fila` por `app_asr_falhar(id,
    // true)` ou por `app_asr_expirar_presos` não gera job novo, e clínica sem
    // ditado nenhum não geraria tick — o heartbeat `asr` pararia de avançar e
    // `scripts/alarme-jobs.mjs` alarmaria (limite de 30 min) sem nada estar
    // quebrado. Ver o comentário de `CRON_TICK_ASR`.
    await boss.schedule("asr-transcrever", CRON_TICK_ASR, {
      origem: "periodico",
    });

    isRunning = true;
    logger.info("queue.supervisor.cron-registrado", { cron: CRON_TICK_ASR });
  } catch (err) {
    logger.error("queue.supervisor.falha-ao-iniciar", {
      erro: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function stopQueueWorkers(): Promise<void> {
  if (!isRunning) return;
  const boss = getBossInstance("consumidor");
  await boss.stop({ graceful: true, timeout: 5000 });
  isRunning = false;
  logger.info("queue.supervisor.parado");
}
