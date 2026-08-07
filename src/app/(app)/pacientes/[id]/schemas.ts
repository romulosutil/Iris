import { z } from "zod";

/**
 * Validação do arquivamento comercial (#174).
 *
 * Vive fora de `actions.ts` porque aquele arquivo é `"use server"` — módulo
 * `"use server"` só pode exportar funções async (Next 16), então um schema Zod
 * exportado de lá quebra o build. Mesmo arranjo de `metas/schemas.ts`.
 */

/** Teto do texto livre: cabe uma justificativa real, não um prontuário. */
export const MOTIVO_ARQUIVAMENTO_MAX = 500;

/** Piso: 10 caracteres é o mesmo do descarte de alerta de risco. */
export const MOTIVO_ARQUIVAMENTO_MIN = 10;

/**
 * O motivo é OBRIGATÓRIO nos dois sentidos, não só ao arquivar.
 *
 * Desarquivar devolve o paciente à contagem de ativos da fatura — é uma
 * mudança no que a clínica paga, exatamente como arquivar, e a trilha
 * `audit_log` precisa poder responder "por quê" nos dois casos. Um motivo só
 * na ida deixaria metade das mudanças de cobrança sem explicação.
 */
export const motivoArquivamentoSchema = z
  .string()
  .trim()
  .min(
    MOTIVO_ARQUIVAMENTO_MIN,
    `Descreva o motivo com pelo menos ${MOTIVO_ARQUIVAMENTO_MIN} caracteres.`,
  )
  .max(
    MOTIVO_ARQUIVAMENTO_MAX,
    `O motivo deve ter no máximo ${MOTIVO_ARQUIVAMENTO_MAX} caracteres.`,
  );
