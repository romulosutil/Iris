import type { Job } from "pg-boss";
import type { LlmJobPayload } from "../types";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Worker de extração de IA (concorrência 5).
 * Respeita AbortSignal caso o limite de tempo expire, garantindo saída limpa sem corromper estado.
 */
export async function processLlmJob(jobs: Job<LlmJobPayload>[]): Promise<void> {
  for (const job of jobs) {
    if (job.signal.aborted) {
      throw new Error("Job LLM aborted before execution");
    }

    const { sessionId, clinicId } = job.data;
    logger.info("queue.llm.iniciando", { sessionId, clinicId, jobId: job.id });

    if (job.signal.aborted) {
      throw new Error("Job LLM aborted during processing");
    }

    logger.info("queue.llm.concluido", { sessionId, jobId: job.id });
  }
}
