import { z } from "zod";

/**
 * Schemas e constantes de validação das metas. Vivem fora de `actions.ts`
 * porque aquele arquivo é `"use server"` — e um módulo `"use server"` só pode
 * exportar funções async (Next 16). Estes objetos (schemas Zod) são
 * importados tanto pelas Server Actions quanto pela UI/testes.
 */

/**
 * Critério de domínio estruturado — "N acertos independentes em M sessões
 * consecutivas". Formulário, NÃO texto livre (wireframe 4.4): é o que a máquina
 * de "candidata a dominada" (decisão 2.4 do modelo de dados) precisa avaliar
 * deterministicamente. `tipo` fixo por ora; abre espaço p/ outros critérios
 * (ex.: percentual) sem quebrar o payload já gravado.
 */
export const criterioDominioSchema = z.object({
  tipo: z.literal("n_acertos_m_sessoes"),
  n: z.number().int().min(1).max(99),
  m: z.number().int().min(1).max(99),
});
export type CriterioDominio = z.infer<typeof criterioDominioSchema>;

export const DISCIPLINAS = ["ABA", "Fono", "TO"] as const;

// Ciclo de revisão estilo ESDM: 8-12 semanas (modelo de dados §1.4).
const cicloSchema = z.number().int().min(8).max(12);

export const criarSchema = z.object({
  patientId: z.string().uuid(),
  descricao: z.string().trim().min(1, "Descreva a meta em linguagem simples."),
  disciplina: z.enum(DISCIPLINAS).optional(),
  criterioDominio: criterioDominioSchema,
  cicloRevisaoSemanas: cicloSchema,
  milestoneIds: z
    .array(z.string().uuid())
    .default([])
    .transform((ids) => [...new Set(ids)]),
});

export const atualizarSchema = z.object({
  goalId: z.string().uuid(),
  descricao: z.string().trim().min(1, "Descreva a meta em linguagem simples."),
  disciplina: z.enum(DISCIPLINAS).nullable().optional(),
  criterioDominio: criterioDominioSchema,
  cicloRevisaoSemanas: cicloSchema,
});
