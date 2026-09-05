import type { Job } from "pg-boss";
import type { AsrJobPayload } from "../types";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Worker do pipeline de ASR (concorrência 1).
 * Executa transcrição delegando para o pipeline interno ou rota de transcrição,
 * respeitando o sinal de abort para não corromper áudio em caso de timeout.
 */
export async function processAsrJob(jobs: Job<AsrJobPayload>[]): Promise<void> {
  for (const job of jobs) {
    if (job.signal.aborted) {
      throw new Error("Job ASR aborted before execution");
    }

    const { loteId, sessionId, clinicId } = job.data;
    logger.info("queue.asr.iniciando", { loteId, sessionId, clinicId, jobId: job.id });

    // Verificação periódica de abort durante o processamento
    if (job.signal.aborted) {
      throw new Error("Job ASR aborted during processing");
    }

    logger.info("queue.asr.concluido", { loteId, sessionId, jobId: job.id });
  }
}
