import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  ExtractionContext,
  ExtractionProvider,
  ExtractionResult,
} from "./provider";
import {
  agentOutputObjectSchema,
  agentOutputSchema,
  type ExtracaoAgente,
} from "./agent-output-schema";
import {
  conventionalOutputObjectSchema,
  conventionalOutputSchema,
} from "./conventional-output-schema";
import type { ExtractionDraft } from "./provider";
import {
  SYSTEM_PROMPT,
  CONVENTIONAL_SYSTEM_PROMPT,
  buildUserMessage,
} from "./prompt";

// Tool schema DERIVADO do contrato zod (fonte única de verdade) — guia o modelo
// aos enums/campos obrigatórios exatos. Sem isto, o modelo inventa formas (ex.:
// tipo "evidencia_comportamental", confianca ausente — achado do teste vivo).
// Deriva do OBJETO, não do schema com preprocess: um ZodEffects não gera JSON
// Schema confiável. O preprocess só normaliza a forma R20 na ENTRADA — o que o
// modelo deve produzir é exatamente o objeto.
const TOOL_INPUT_SCHEMA = zodToJsonSchema(agentOutputObjectSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

const CONVENTIONAL_TOOL_INPUT_SCHEMA = zodToJsonSchema(
  conventionalOutputObjectSchema,
  { target: "openApi3", $refStrategy: "none" },
);

// Nome da ferramenta POR MODO. Não é cosmético: o nome é a única pista que o
// modelo tem, além do schema, do que está sendo pedido — chamar de
// "registrar_extracao" um resumo narrativo empurra o modelo de volta ao
// vocabulário de extração por domínio.
export const TOOL_NAME_ABA = "registrar_extracao";
export const TOOL_NAME_CONVENCIONAL = "registrar_resumo_sessao";

// Abstração do modelo: recebe system+user MAIS o contrato da ferramenta,
// devolve o input CRU da ferramenta (objeto JSON ainda não validado).
// Injetável → o unit test passa um fake; produção usa createAnthropicInvoker.
//
// `toolName`/`toolSchema` viajam no argumento, e não como constante de módulo,
// porque antes o schema estava CAPTURADO NO CLOSURE de createAnthropicInvoker:
// ramificar o modo dentro de `extrair()` não teria efeito nenhum em produção —
// o modo convencional receberia o tool schema do modo ABA.
export type AgentInvoker = (input: {
  system: string;
  user: string;
  toolName: string;
  toolSchema: unknown;
}) => Promise<unknown>;

function payloadDoSubtipo(e: ExtracaoAgente): unknown {
  switch (e.tipo) {
    case "evidencia":
      return e.evidencia ?? {};
    case "cadeia":
      return e.cadeia ?? {};
    case "registro_abc":
      return e.registro_abc ?? {};
    case "ausencia_comportamento":
      return e.ausencia_comportamento ?? {};
    case "preferencia_reforcador":
      return e.preferencia_reforcador ?? {};
  }
}

/**
 * Resolve o modo do agente. O campo tipado de `ExtractionContext` manda; o
 * sniff do contexto canônico fica só como retaguarda (chamadores antigos que
 * ainda não passam `modo`). Default = "protocol_driven": na dúvida, o caminho
 * que roda em produção.
 */
function resolverModo(
  ctx: ExtractionContext,
  contexto: unknown,
): "terapia_convencional" | "protocol_driven" {
  if (ctx.modo) return ctx.modo;
  const sniff = contexto as { modo?: string } | null | undefined;
  return sniff?.modo === "terapia_convencional"
    ? "terapia_convencional"
    : "protocol_driven";
}

export class ClaudeProvider implements ExtractionProvider {
  constructor(private readonly invoker: AgentInvoker) {}

  async extrair(ctx: ExtractionContext): Promise<ExtractionResult> {
    const contexto = ctx.contextoCanonico ?? { metas_ativas: ctx.metasAtivas };
    const modo = resolverModo(ctx, contexto);
    const user = buildUserMessage({
      notaConsolidada: ctx.notaConsolidada,
      contexto,
      modo,
    });

    const convencional = modo === "terapia_convencional";

    // Lança em erro de LLM (o caller trata como pendente_reprocessamento).
    const bruto = await this.invoker({
      system: convencional ? CONVENTIONAL_SYSTEM_PROMPT : SYSTEM_PROMPT,
      user,
      toolName: convencional ? TOOL_NAME_CONVENCIONAL : TOOL_NAME_ABA,
      toolSchema: convencional
        ? CONVENTIONAL_TOOL_INPUT_SCHEMA
        : TOOL_INPUT_SCHEMA,
    });

    // Valida contra o contrato do MODO. Lança se o modelo alucinou a forma —
    // nunca gravamos saída fora do schema.
    if (convencional) {
      const saida = conventionalOutputSchema.parse(bruto);
      return {
        drafts: [draftDoResumoConvencional(saida)],
        alertaRisco: saida.alerta_risco ?? null,
      };
    }

    const saida = agentOutputSchema.parse(bruto);

    return {
      drafts: saida.extracoes.map((e) => ({
        subtipo: e.tipo,
        trechoFonte: e.trecho_fonte,
        confianca: e.confianca,
        justificativaConfianca: e.justificativa_confianca,
        inconsistenteComHistorico: e.inconsistente_com_historico ?? false,
        parContrasteId: e.par_contraste_id ?? null,
        payload: payloadDoSubtipo(e) as object,
        estado: "sugerida" as const,
      })),
      alertaRisco: saida.alerta_risco ?? null,
    };
  }
}

/**
 * O modo Terapia Convencional produz UM artefato por sessão — o resumo — e não
 * uma lista de extrações. Ele entra como `sugerida` (decisão do dono): vai para
 * a mesma tela de revisão do modo ABA, e o terapeuta aprova ou descarta. Isso
 * mantém o humano no laço (princípio 3 do README) e atende o Risco 2 do §4 do
 * protocolo — a IA nunca grava leitura clínica sem passar pelo terapeuta.
 */
function draftDoResumoConvencional(
  saida: ConventionalOutputParsed,
): ExtractionDraft {
  return {
    subtipo: "resumo_terapia_convencional",
    // `trecho_fonte` é NOT NULL na tabela e este contrato não tem um trecho
    // único que sustente o resumo inteiro (os trechos são POR tema, dentro do
    // payload). String vazia segue o precedente do PENDENTE_DRAFT.
    trechoFonte: "",
    // Constante, e não um juízo: este contrato NÃO TEM eixo de confiança — não
    // há "confiança do resumo" para o modelo reportar (§3 do protocolo: não há
    // equivalente a `confianca` por extração, porque não há extrações). A
    // coluna é NOT NULL, então gravamos o valor neutro; ler isto como "a IA
    // está muito confiante" seria erro de leitura.
    confianca: "alta",
    inconsistenteComHistorico: false,
    parContrasteId: null,
    payload: saida as object,
    estado: "sugerida" as const,
  };
}

type ConventionalOutputParsed = ReturnType<
  typeof conventionalOutputObjectSchema.parse
>;

// Invoker de produção: chama a API da Anthropic com tool_use forçado. NÃO é
// coberto por unit test (chamada viva) — é validado pela bake-off (dado
// fictício) e pelo teste de integração inline. Modelo default: Claude Sonnet.
export function createAnthropicInvoker(
  model = "claude-sonnet-5",
): AgentInvoker {
  return async ({ system, user, toolName, toolSchema }) => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: [
        {
          name: toolName,
          description:
            "Registra a saída estruturada da sessão conforme o schema.",
          input_schema: toolSchema as { type: "object" } & Record<
            string,
            unknown
          >,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: user }],
    });
    const block = resp.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("Anthropic não retornou tool_use.");
    }
    return block.input;
  };
}
