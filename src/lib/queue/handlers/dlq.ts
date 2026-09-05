import type { JobWithMetadata } from "pg-boss";
import { logger } from "@/lib/observabilidade/logger";

/**
 * Consumidor da Dead-Letter Queue (DLQ).
 * Quando um job esgota o teto de 3 tentativas, ele é movido para ca.
 * Registra log estruturado sanitizado sem expor áudio, transcrição ou dados clínicos (PII).
 */
export async function processDlqJob(
  jobs: JobWithMetadata<Record<string, unknown>>[],
): Promise<void> {
  for (const job of jobs) {
    const payload = (job.data || {}) as Record<string, unknown>;

    // Identificadores de correlação seguros (UUIDs técnicos, sem PII)
    const correlation = {
      jobId: job.id,
      sourceQueue: job.sourceName ?? job.name,
      sourceJobId: job.sourceId ?? null,
      retryCount: job.sourceRetryCount ?? job.retryCount ?? 3,
      sessionId:
        typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      loteId: typeof payload.loteId === "string" ? payload.loteId : undefined,
      clinicId:
        typeof payload.clinicId === "string" ? payload.clinicId : undefined,
    };

    logger.error("queue.dlq-job-falhou-definitivamente", correlation);
  }
}
