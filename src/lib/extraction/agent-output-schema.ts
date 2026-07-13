import { z } from "zod";

// Espelha docs/agente/output-schema.json em zod, para validar a saída do LLM
// ANTES de gravar (o agente pode alucinar forma; o schema é o contrato).
// Campos de função/nível de ajuda são STRING livre de propósito (R19: a
// taxonomia vem do protocolo no contexto, não é hardcoded). Só viram enum os
// campos com domínio fechado e agnóstico de protocolo.

export const confiancaEnum = z.enum(["alta", "media", "baixa"]);

export const tipoExtracaoEnum = z.enum([
  "evidencia",
  "registro_abc",
  "ausencia_comportamento",
  "cadeia",
  "preferencia_reforcador",
]);

const alvoSchema = z.object({
  goal_id: z.string().nullable().optional(),
  protocol_id: z.string().nullable().optional(),
  dominio_id: z.string().nullable().optional(),
});

const evidenciaSchema = z.object({
  descricao: z.string().optional(),
  polaridade: z.enum(["positiva", "negativa"]).optional(),
  funcao: z.string().optional(),
  funcao_indefinida: z.boolean().optional(),
  alvos: z.array(alvoSchema).optional(),
  nivel_ajuda: z.string().optional(),
  eixo_protocolo: z
    .enum(["capacidade", "assistencia_cuidador"])
    .nullable()
    .optional(),
  resultado: z
    .enum(["acerto", "erro", "acerto_apos_dica", "nao_aplicavel"])
    .optional(),
  tentativas: z
    .object({
      informado: z.boolean().optional(),
      total: z.number().int().nullable().optional(),
      acertos: z.number().int().nullable().optional(),
    })
    .optional(),
  topografia: z
    .enum([
      "vocal_articulado",
      "vocal_nao_articulado",
      "gestual_simbolico",
      "gestual_elementar",
      "fisico",
      "nao_informado",
    ])
    .optional(),
  producao_literal: z.string().nullable().optional(),
  alvo_producao: z.string().nullable().optional(),
  ambiente: z.enum(["estruturado", "natural", "nao_informado"]).optional(),
  frequencia: z
    .object({
      informada: z.boolean().optional(),
      valor: z.number().nullable().optional(),
      unidade: z.string().nullable().optional(),
    })
    .optional(),
  dimensoes_qualidade: z
    .object({
      variabilidade: z.string().nullable().optional(),
      generalizacao: z.string().nullable().optional(),
      restricao_preferencia: z.string().nullable().optional(),
    })
    .optional(),
});

const cadeiaSchema = z.object({
  nome: z.string().optional(),
  etapas: z
    .array(
      z.object({
        descricao: z.string().optional(),
        nivel_ajuda: z.string().optional(),
      }),
    )
    .optional(),
});

const registroAbcSchema = z.object({
  antecedente: z.string().optional(),
  comportamento: z.string().optional(),
  duracao_segundos: z.number().int().nullable().optional(),
  consequencia_regulacao: z.string().optional(),
  categoria: z.enum(["comportamental", "sensorial"]).optional(),
  subcategoria_sensorial: z.string().nullable().optional(),
  intensidade_estimulo: z
    .enum(["cotidiano_minimo", "atipico_intenso"])
    .nullable()
    .optional(),
  modo_resposta: z.enum(["ativo", "passivo"]).nullable().optional(),
  severidade: z.enum(["leve", "moderada", "grave"]).optional(),
});

const ausenciaSchema = z.object({
  comportamento: z.string().optional(),
  contexto: z.string().optional(),
});

const preferenciaSchema = z.object({
  item_atividade: z.string().optional(),
  valencia: z.enum(["alta", "baixa", "saciado"]).optional(),
});

export const extracaoSchema = z.object({
  tipo: tipoExtracaoEnum,
  trecho_fonte: z.string().min(1),
  confianca: confiancaEnum,
  justificativa_confianca: z.string().optional(),
  inconsistente_com_historico: z.boolean().optional(),
  par_contraste_id: z.string().nullable().optional(),
  evidencia: evidenciaSchema.nullable().optional(),
  cadeia: cadeiaSchema.nullable().optional(),
  registro_abc: registroAbcSchema.nullable().optional(),
  ausencia_comportamento: ausenciaSchema.nullable().optional(),
  preferencia_reforcador: preferenciaSchema.nullable().optional(),
});

// Sinalizações são metadados ADVISORY (guiam a UI de fricção), não dado clínico.
// O tipo é string livre de propósito: os 3 canônicos são
// inconsistencia_historico | possivel_erro_transcricao | texto_ambiguo, mas o
// modelo às vezes inventa rótulos — tolerar isso não pode afundar a extração
// (achado do teste vivo, 12/07/2026).
export const sinalizacaoSchema = z.object({
  tipo: z.string(),
  detalhe: z.string().optional(),
});

export const agentOutputSchema = z.object({
  extracoes: z.array(extracaoSchema),
  resumo_sessao: z.string(),
  // .catch([]): sinalizações malformadas degradam para vazio, nunca invalidam a
  // saída inteira (extracoes é o que importa e permanece estrito).
  sinalizacoes: z.array(sinalizacaoSchema).optional().catch([]),
});

export type AgentOutput = z.infer<typeof agentOutputSchema>;
export type ExtracaoAgente = z.infer<typeof extracaoSchema>;
