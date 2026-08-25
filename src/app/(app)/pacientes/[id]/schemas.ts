import { z } from "zod";
import { FUSO_CLINICA } from "../../agenda/fuso";
import { dataCivilNoFuso } from "@/lib/jobs/retencao";

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

/* ────────────────────────────────────────────────────────────────────────────
 * #352 — alta clínica.
 *
 * Alta e arquivamento são atos DIFERENTES e a validação é separada de
 * propósito, mesmo com os limites de texto coincidindo hoje: arquivar mexe no
 * que a clínica paga, dar alta abre o relógio de retenção do prontuário
 * (`app_retencao_vence_em`, `0128`) e é o que leva o paciente à fila de
 * expurgo. Compartilhar o schema faria uma mudança de política de cobrança
 * mexer, sem querer, na porta de entrada da eliminação de dado pessoal.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Teto do texto livre da alta. Mesmo racional do arquivamento. */
export const MOTIVO_ALTA_MAX = 500;

/** Piso: 10 caracteres, o mesmo do descarte de alerta de risco. */
export const MOTIVO_ALTA_MIN = 10;

/**
 * O motivo é obrigatório nos DOIS sentidos.
 *
 * Desfazer alta reabre o prontuário, tira o paciente da fila de expurgo e
 * reancora o dedup do aviso prévio (`criado_em > alta_em`, R352.D3). É uma
 * mudança no prazo legal de guarda — a trilha precisa poder responder "por
 * quê" tanto na ida quanto na volta.
 */
export const motivoAltaSchema = z
  .string()
  .trim()
  .min(
    MOTIVO_ALTA_MIN,
    `Descreva o motivo com pelo menos ${MOTIVO_ALTA_MIN} caracteres.`,
  )
  .max(
    MOTIVO_ALTA_MAX,
    `O motivo deve ter no máximo ${MOTIVO_ALTA_MAX} caracteres.`,
  );

/**
 * Data da alta: `YYYY-MM-DD` e **não-futura** (R352.A2).
 *
 * Alta é fato consumado, não agendamento. Aceitar data futura criaria um
 * paciente cujo relógio de retenção já corre para uma alta que ainda não
 * aconteceu — e o vencimento (`alta_em + 10 anos`) sairia errado numa conta
 * que a clínica lê como prazo legal.
 *
 * A fronteira do "hoje" é a DATA CIVIL no fuso da clínica, não `new Date()`
 * cru: às 22h em São Paulo o servidor em UTC já está no dia seguinte, e o
 * coordenador seria impedido de registrar a alta de hoje. Mesma disciplina de
 * `src/lib/trial.ts`, e a mesma conta que o SQL faz com
 * `(now() AT TIME ZONE c.timezone)::date`.
 *
 * ⚠️ `FUSO_CLINICA` é chumbado (`America/Sao_Paulo`) enquanto `clinic.timezone`
 * não chega até aqui. A dívida está registrada no `BACKLOG.md` (R352.F3); o
 * SQL do expurgo já lê `clinic.timezone` de verdade.
 */
export const dataAltaSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da alta.")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Informe uma data válida.",
  })
  .refine((valor) => valor <= dataCivilNoFuso(new Date(), FUSO_CLINICA), {
    message: "A data da alta não pode ser futura.",
  });
