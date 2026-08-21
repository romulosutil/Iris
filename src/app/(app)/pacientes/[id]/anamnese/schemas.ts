import { z } from "zod";
import { ORDEM_EIXOS } from "@/lib/evidence/espectro";
import { DISCIPLINAS } from "../metas/schemas";

/**
 * Schemas e constantes de validação da anamnese. Vivem fora de `actions.ts`
 * porque aquele arquivo é `"use server"` — e um módulo `"use server"` só pode
 * exportar funções async (Next 16). Estes objetos (schemas Zod) são
 * importados tanto pelas Server Actions quanto pela UI/testes.
 */

/**
 * Procedências da anamnese: de onde veio cada informação registrada.
 * - relatado_responsavel: informado pelo responsável/familiar
 * - observado_avaliador: observado diretamente pelo avaliador
 * - registro_anterior: colhido de registro prévio (prontuário, avaliação anterior)
 */
export const PROCEDENCIAS = [
  "relatado_responsavel",
  "observado_avaliador",
  "registro_anterior",
] as const;
export type Procedencia = (typeof PROCEDENCIAS)[number];

/**
 * Eixos da anamnese — idêntico a ORDEM_EIXOS do espectro.
 * Sincronismo obrigatório: qualquer mudança em espectro.ts deve refletir aqui
 * para que o CHECK do banco e o Zod não divirjam em silêncio.
 */
export const EIXOS_ANAMNESE = ORDEM_EIXOS as [string, ...string[]];
export type EixoAnamnese = (typeof EIXOS_ANAMNESE)[number];

/**
 * Alvo individual da anamnese — corresponde a `anamnese_alvo` na tabela.
 * `nivel_ajuda_inicial` pode ser null (dado não coletado) mas NUNCA é 0 por default.
 */
const alvoBaseSchema = z.object({
  eixo: z.enum(EIXOS_ANAMNESE),
  descricao: z.string().trim().min(1, "Descreva o alvo em linguagem simples."),
  disciplina: z.enum(DISCIPLINAS).nullable().optional(),
  milestone_id: z.string().uuid().nullable().optional(),
  nivel_ajuda_inicial: z.number().int().min(0).max(20).nullable().optional(),
  procedencia: z.enum(PROCEDENCIAS),
  criterio_n: z.number().int().min(1).max(99).default(3),
  criterio_m: z.number().int().min(1).max(99).default(4),
  ciclo_revisao_semanas: z.number().int().min(8).max(12).default(8),
});

/**
 * Garante que undefined em nivel_ajuda_inicial não vira 0.
 * Se o campo vier undefined, fica null. Se vier null, continua null.
 */
export const alvoSchema = alvoBaseSchema.transform((data) => ({
  ...data,
  nivel_ajuda_inicial: data.nivel_ajuda_inicial ?? null,
}));

export type Alvo = z.infer<typeof alvoSchema>;

/**
 * Schema para salvar um rascunho de anamnese.
 * Teto de 24 alvos (ANAM-08): validação por tamanho com mensagem nomeada.
 */
export const salvarRascunhoSchema = z.object({
  patientId: z.string().uuid(),
  alvos: z
    .array(alvoSchema)
    .min(1, "Adicione pelo menos um alvo.")
    .max(24, "Máximo de 24 alvos por anamnese."),
});

export type SalvarRascunho = z.infer<typeof salvarRascunhoSchema>;

/**
 * Schema para validar (publicar) uma anamnese de rascunho.
 * Apenas um UUID é necessário — a validação de regras de negócio (protocolo ativo,
 * consentimento, etc.) acontece na Server Action com acesso ao banco.
 */
export const validarAnamneseSchema = z.object({
  anamneseId: z.string().uuid(),
});

export type ValidarAnamnese = z.infer<typeof validarAnamneseSchema>;
