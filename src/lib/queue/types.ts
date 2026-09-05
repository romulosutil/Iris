import type { DrizzleTransactionLike } from "pg-boss";

export type AsrJobPayload = {
  loteId: string;
  sessionId: string;
  clinicId: string;
};

export type LlmJobPayload = {
  sessionId: string;
  clinicId: string;
};

export type BillingJobPayload = {
  dryRun?: boolean;
  cobrancaId?: string;
  periodo?: string;
};

export type ExpurgoJobPayload = {
  finalidade?: string;
  limiteDias?: number;
};

export type DlqJobPayload = {
  originalQueue: string;
  originalPayload: unknown;
  failedReason?: string;
  failedAt: string;
};

export type QueueJobMap = {
  "asr-transcrever": AsrJobPayload;
  "llm-extracao": LlmJobPayload;
  "billing-reconciliar": BillingJobPayload;
  "expurgo-audit-log": ExpurgoJobPayload;
  dlq: DlqJobPayload;
};

export type QueueName = keyof QueueJobMap;

export type EnqueueOptions = {
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  deadLetter?: string;
  priority?: number;
  startAfter?: number | string | Date;
  tx?: DrizzleTransactionLike;
};
