import { z } from "zod";

// Espelha docs/agente/output-schema.json em zod, para validar a saída do LLM
// ANTES de gravar (o agente pode alucinar forma; o schema é o contrato).
// Campos de função/nível de ajuda são STRING livre de propósito (R19: a
// taxonomia vem do protocolo no contexto, não é hardcoded). Só viram enum os
// campos com domínio fechado e agnóstico de protocolo.

const confiancaEnum = z.enum(["alta", "media", "baixa"]);

// Exportado para o teste de sincronização doc-vs-Zod (R1 de #390): compara
// `.options` deste enum com o enum de `extracoes[].tipo` em output-schema.json.
export const tipoExtracaoEnum = z.enum([
  "evidencia",
  "registro_abc",
  "ausencia_comportamento",
  "cadeia",
  "preferencia_reforcador",
  // #390 — modos TCC/convencional (enum PG `extraction_subtipo` ganhou os 3
  // valores na migração 0108; `pendente` é legado do NullProvider e fica de
  // fora daqui, nunca esteve no doc nem no Zod).
  "registro_pensamento",
  "aplicacao_escala_relatada",
  "tarefa_casa",
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

// ─── #390 — modo TCC: subsídio ao Registro de Pensamento Disfuncional (RPD) ──
// Campos do `rpd-desenho-de-formulario.md` §6 (mais recente que
// `protocolo-tcc.md` §2.5, desatualizado). Shape fechado a esta issue — não
// inclui situação/pensamento_automático/emoção/resposta_racional (fora de
// escopo de #390, cobertos por `resumo_sessao`/`sinalizacoes` por ora).
const registroPensamentoSchema = z.object({
  evidencias_favor: z.string().nullable().optional(),
  evidencias_contra: z.string().nullable().optional(),
  credibilidade_inicial: z.number().int().min(0).max(100).nullable().optional(),
  credibilidade_alternativa: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional(),
  comportamento_resultante: z.string().nullable().optional(),
  // Estrutural, SEM enum fixo: a taxonomia (R19) vem do contrato/config da
  // clínica (taxonomia_distorcoes), validada na fila de validação do RPD —
  // não no parse do Zod, que não tem acesso a config por clínica.
  distorcoes_cognitivas: z.array(z.string()).optional(),
});

// ─── #390 — aplicação de escala relatada (ex.: PHQ-9) ────────────────────────
// `fonte_do_escore` é procedimental (como o número chegou), não taxonomia
// clínica — por isso enum fechado, como `ambiente`/`resultado` em cima.
const aplicacaoEscalaRelatadaSchema = z.object({
  protocol_id: z.string().nullable().optional(),
  escore_relatado: z.number().nullable().optional(),
  fonte_do_escore: z
    .enum(["paciente_informou", "terapeuta_calculou_na_sessao", "nao_informado"])
    .optional(),
  // NUNCA `.default(false)`: item de risco não respondido/pulado é `null`,
  // distinto de "respondeu 0/negou" (`false`). Recusa de resposta a item de
  // risco é, em si, sinal de alerta em vários protocolos de triagem
  // (protocolo-tcc.md §7.3). `emoção`/`escala_intensidade` não pertencem a
  // este objeto nos docs de design (ficam em `registro_pensamento`, fora do
  // shape fechado acima) — não inventados aqui.
  item_risco_positivo: z.boolean().nullable(),
});

// ─── #390 — tarefa de casa (shape MÍNIMO) ─────────────────────────────────────
// #394 ("Tarefa de casa: evento com duas pontas no tempo") desenha o modelo
// completo (atribuição + retorno) depois. Aqui só reserva o valor no enum de
// `tipo` com o mínimo plausível, sem se comprometer com mais.
const tarefaCasaSchema = z.object({
  descricao: z.string(),
  trecho_fonte: z.string(),
});

const extracaoSchema = z.object({
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
  registro_pensamento: registroPensamentoSchema.nullable().optional(),
  aplicacao_escala_relatada: aplicacaoEscalaRelatadaSchema.nullable().optional(),
  tarefa_casa: tarefaCasaSchema.nullable().optional(),
});

// Sinalizações são metadados ADVISORY (guiam a UI de fricção), não dado clínico.
// O tipo é string livre de propósito: os 4 canônicos são
// inconsistencia_historico | possivel_erro_transcricao | texto_ambiguo |
// risco_seguranca, mas o modelo às vezes inventa rótulos — tolerar isso não
// pode afundar a extração (achado do teste vivo, 12/07/2026). NÃO usar
// `z.enum()` aqui: um rótulo inventado invalidaria o item, e `.catch([])` do
// array (abaixo) descartaria a lista INTEIRA, não só o item ruim.
const sinalizacaoSchema = z.object({
  tipo: z.string(),
  detalhe: z.string().optional(),
});

// Não-enforcing — mantido só para o teste de sincronização doc-vs-Zod (R1 de
// #390). `sinalizacaoSchema.tipo` continua `z.string()` livre acima; esta
// lista NÃO participa da validação em runtime.
export const SINALIZACAO_TIPO_CANONICOS = [
  "inconsistencia_historico",
  "possivel_erro_transcricao",
  "texto_ambiguo",
  "risco_seguranca",
] as const;

// ─── #122 — sinal de risco transversal (R20 / R5-TC) ─────────────────────────
// Camada GLOBAL do agente, mais checagem de segurança do que regra de extração:
// dispara mesmo com `protocolos_ativos: []`, em qualquer domínio ou protocolo, e
// não é engolida por nenhuma outra regra. Fora da fila de validação por exceção
// do coordenador (V1).
const alertaRiscoCategoriaEnum = z.enum([
  "ideacao_suicida",
  "autolesao",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

const alertaRiscoSeveridadeEnum = z.enum([
  "ideacao_passiva",
  "ideacao_ativa_sem_plano",
  "ideacao_ativa_com_plano",
  "autolesao_recente",
  "tentativa_relatada",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

const alertaRiscoCertezaEnum = z.enum(["explicito", "ambiguo_citado"]);

const alertaRiscoSchema = z.object({
  categoria: alertaRiscoCategoriaEnum,
  severidade: alertaRiscoSeveridadeEnum,
  // R20 não tem `certeza`; o default é o lado CONSERVADOR. `ambiguo_citado`
  // rebaixa a prioridade visual (§2), então presumi-lo na ausência de sinal
  // enfraqueceria um alerta que o agente considerou direto. `explicito` só
  // afeta apresentação — o prazo é o mesmo nos dois casos (§4.1).
  certeza: alertaRiscoCertezaEnum.default("explicito"),
  // literal do diário, obrigatório: um alerta sem trecho seria veredito da IA
  // sem evidência, e a §6 exige o trecho sempre visível ao lado do alerta.
  trecho_fonte: z.string().min(1),
  detalhe: z.string().min(1),
});

/**
 * Levanta um sinal de risco emitido na forma do R20
 * (`sinalizacoes[].tipo === "risco_seguranca"`) para o campo dedicado, ANTES da
 * validação.
 *
 * Sem isto o `.catch([])` de `sinalizacoes` degradaria um sinal de risco
 * malformado para vazio — silenciosamente. Sinalização comum pode degradar;
 * risco de vida não pode. Depois desta normalização, um risco presente e
 * malformado invalida a saída inteira (estado `erro_validacao`, visível), que é
 * o comportamento alto e não o baixo.
 */
function levantarRiscoDeSinalizacoes(entrada: unknown): unknown {
  if (typeof entrada !== "object" || entrada === null) return entrada;
  const obj = entrada as Record<string, unknown>;
  if (obj.alerta_risco != null) return entrada;
  if (!Array.isArray(obj.sinalizacoes)) return entrada;

  const risco = obj.sinalizacoes.find(
    (s): s is Record<string, unknown> =>
      typeof s === "object" &&
      s !== null &&
      (s as Record<string, unknown>).tipo === "risco_seguranca",
  );
  if (!risco) return entrada;

  return {
    ...obj,
    alerta_risco: {
      categoria: risco.categoria,
      severidade: risco.severidade,
      ...(risco.certeza != null ? { certeza: risco.certeza } : {}),
      trecho_fonte: risco.trecho_fonte ?? risco.trecho,
      detalhe: risco.detalhe ?? risco.descricao,
    },
  };
}

// Forma do objeto, SEM o preprocess. Exportada separadamente porque é ela que
// alimenta `zodToJsonSchema` para o tool schema do Claude: um ZodEffects não
// gera JSON Schema confiável, e o tool schema é o que ensina a forma ao modelo.
export const agentOutputObjectSchema = z.object({
  extracoes: z.array(extracaoSchema),
  resumo_sessao: z.string(),
  // #390 — modo convencional: temas livres da sessão (R7-TC). Texto curto,
  // nunca enum fechado (protocolo do modo convencional). `tema_recorrente_sinalizado`
  // e `padrao_participacao_verbal` NÃO entram aqui: `CONVENTIONAL_SYSTEM_PROMPT`
  // (prompt.ts) não promete esses campos na saída — são propostas do doc de
  // protocolo (§3.1), não contrato de runtime.
  temas: z.array(z.string()).optional(),
  // .catch([]): sinalizações malformadas degradam para vazio, nunca invalidam a
  // saída inteira (extracoes é o que importa e permanece estrito).
  sinalizacoes: z.array(sinalizacaoSchema).optional().catch([]),
  // ESTRITO e sem .catch de propósito: ver `levantarRiscoDeSinalizacoes`.
  // Forma ÚNICA, compartilhada pelos 3 modos (ABA/TCC/convencional) — sem
  // variante por modo (#390).
  alerta_risco: alertaRiscoSchema.nullable().optional(),
});

export const agentOutputSchema = z.preprocess(
  levantarRiscoDeSinalizacoes,
  agentOutputObjectSchema,
);

export type AgentOutput = z.infer<typeof agentOutputSchema>;
export type ExtracaoAgente = z.infer<typeof extracaoSchema>;
export type AlertaRiscoAgente = z.infer<typeof alertaRiscoSchema>;
