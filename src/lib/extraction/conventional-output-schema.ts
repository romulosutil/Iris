import { z } from "zod";
import {
  alertaRiscoSchema,
  levantarRiscoDeSinalizacoes,
  sinalizacaoSchema,
} from "./agent-output-schema";

// Contrato de SAÍDA do modo Terapia Convencional (§3 de
// docs/agente/protocolo-terapia-convencional.md; regras R1-TC a R9-TC).
//
// Arquivo IRMÃO, e não mais um campo no contrato ABA, por dois motivos:
//
// 1. `agentOutputObjectSchema` alimenta o tool schema contra o qual o modelo de
//    produção foi calibrado. Qualquer campo novo lá dentro muda o JSON Schema
//    enviado em TODA extração ABA — risco de regressão no caminho que já roda,
//    para servir um modo que ainda não rodou.
// 2. Os dois contratos não têm interseção útil: aqui não existe `extracoes[]`,
//    não existe eixo de confiança por item e não existe domínio de protocolo.
//    Um schema único com metade dos campos opcionais aceitaria as duas formas
//    E as duas formas erradas.
//
// O que este contrato conserta (achado B3 do PR #305): hoje uma sessão de
// paciente convencional é validada contra o contrato ABA, onde `extracoes: []`
// é uma saída VÁLIDA e `resumo_sessao` não é persistido em lugar nenhum. O modo
// consolidava com sucesso e gravava zero artefato — falha silenciosa, com a
// tela de revisão vazia e nada indicando erro.

const temaSchema = z.object({
  tema: z.string().min(1),
  // R1-TC/R7-TC: tema sem trecho literal é leitura da IA, não registro. O
  // trecho é POR ITEM de propósito — a §3.1 do protocolo aponta que perder o
  // trecho por item foi exatamente o defeito do campo único antigo.
  trecho_fonte: z.string().min(1),
});

const temaRecorrenteSchema = z.object({
  tema: z.string().min(1),
  // R4-TC exige linguagem hedged aqui. O gate automatizado de hedging NÃO
  // existe (fica no eval, não no schema): uma regex de "pode valer" seria
  // trivialmente contornável e daria falsa sensação de cobertura.
  observacao: z.string().min(1),
  trecho_fonte: z.string().min(1),
});

// `presente: false` significa "nada de notável no padrão de participação", não
// "o paciente participou bem" (§3.1). Objeto e não booleano solto: achatar
// `presente` + `descricao` perderia a distinção entre "não observado" e
// "observado, sem descrição".
const padraoParticipacaoSchema = z.object({
  presente: z.boolean(),
  descricao: z.string().nullable(),
});

/**
 * Forma do objeto, SEM o preprocess — é ela que alimenta `zodToJsonSchema` para
 * o tool schema do modo (um ZodEffects não gera JSON Schema confiável).
 *
 * Todos os campos de conteúdo são OBRIGATÓRIOS. Aqui o resumo É o artefato: se
 * ele vier ausente ou vazio, não há nada a gravar, e o comportamento correto é
 * lançar (o caller marca `pendente_reprocessamento`, que é visível) em vez de
 * gravar um artefato oco — que é precisamente o bug B3.
 *
 * `tema_recorrente_sinalizado: []` é resposta VÁLIDA e esperada (caso TC-4):
 * array obrigatório, conteúdo livre para ser vazio.
 */
export const conventionalOutputObjectSchema = z.object({
  resumo_sessao: z.string().min(1),
  temas: z.array(temaSchema),
  tema_recorrente_sinalizado: z.array(temaRecorrenteSchema),
  padrao_participacao_verbal: padraoParticipacaoSchema,
  // .catch([]) igual ao contrato ABA: sinalização é metadado advisory e nunca
  // pode afundar o resumo inteiro.
  sinalizacoes: z.array(sinalizacaoSchema).optional().catch([]),
  // ESTRITO e sem .catch, pela mesma justificativa do R20 no contrato ABA: um
  // risco presente e malformado precisa invalidar a saída (estado visível), não
  // degradar para "sem risco" em silêncio. Ausência de risco = campo omitido —
  // não existe `presente: boolean` (ver §3 do protocolo).
  alerta_risco: alertaRiscoSchema.nullable().optional(),
});

export const conventionalOutputSchema = z.preprocess(
  levantarRiscoDeSinalizacoes,
  conventionalOutputObjectSchema,
);

export type ConventionalOutput = z.infer<typeof conventionalOutputObjectSchema>;
