import type { DrizzleTransactionLike } from "pg-boss";

/**
 * Payload do tick de transcrição (#72 / D73).
 *
 * Os três identificadores são OPCIONAIS e servem SÓ para correlação de log: o
 * trabalho de verdade é reservado do lado do banco por `app_asr_reservar`, que
 * varre a fila INTEIRA (todas as clínicas) e não sabe nada sobre este job. Um
 * tick disparado pelo upload de um lote e um tick disparado pelo cron de
 * segurança fazem exatamente a mesma coisa; `origem` existe para o log dizer
 * qual dos dois foi, não para mudar comportamento.
 *
 * NÃO é payload de clipe: nenhum áudio, nenhuma transcrição, nenhum dado de
 * paciente atravessa a fila. O que trafega é um "acorda e drena a fila".
 */
export type AsrJobPayload = {
  origem: "lote" | "periodico";
  loteId?: string;
  sessionId?: string;
  clinicId?: string;
};

export type DlqJobPayload = {
  originalQueue: string;
  originalPayload: unknown;
  failedReason?: string;
  failedAt: string;
};

export type QueueJobMap = {
  "asr-transcrever": AsrJobPayload;
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
  /**
   * Transação Drizzle em curso. `DrizzleTransactionLike` é export de primeira
   * classe do próprio `pg-boss` (`dist/adapters/drizzle.d.ts`) — não há tipagem
   * local a manter em dia.
   */
  tx?: DrizzleTransactionLike;
};
