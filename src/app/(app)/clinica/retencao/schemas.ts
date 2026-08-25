import { z } from "zod";

/**
 * #352 — validação do expurgo de prontuário expirado.
 *
 * Vive fora de `logic.ts` porque aquele módulo é `server-only`: o diálogo é um
 * Client Component e precisa do piso do motivo para o `minLength` do campo.
 * Importar um valor (não um tipo) de módulo `server-only` estoura em runtime no
 * navegador com o CI verde — mesmo arranjo de `pacientes/[id]/schemas.ts`.
 */

/** Teto do texto livre. Cabe uma justificativa real, não um prontuário. */
export const MOTIVO_EXPURGO_MAX = 500;

/**
 * Piso: 10 caracteres, o mesmo do arquivamento e do descarte de alerta de
 * risco. Aqui o motivo é o que sobrevive ao dado: depois do expurgo, a linha da
 * trilha é a única coisa que existe sobre o ato — o prontuário não está mais lá
 * para ser consultado.
 */
export const MOTIVO_EXPURGO_MIN = 10;

export const motivoExpurgoSchema = z
  .string()
  .trim()
  .min(
    MOTIVO_EXPURGO_MIN,
    `Descreva o motivo com pelo menos ${MOTIVO_EXPURGO_MIN} caracteres.`,
  )
  .max(
    MOTIVO_EXPURGO_MAX,
    `O motivo deve ter no máximo ${MOTIVO_EXPURGO_MAX} caracteres.`,
  );

/**
 * O identificador vem da URL/`FormData` — ou seja, do usuário. Sem o formato
 * validado aqui, um `pacienteId` malformado chega ao Postgres como cast
 * inválido (`22P02`) e a exceção sobe como erro genérico de banco, não como
 * recusa da aplicação.
 */
export const pacienteIdSchema = z
  .string()
  .trim()
  .uuid("Paciente não informado.");
