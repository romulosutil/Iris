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

// Abstração do modelo: recebe system+user, devolve o input CRU da ferramenta
// registrar_extracao (objeto JSON ainda não validado). Injetável → o unit test
// passa um fake; produção usa createAnthropicInvoker (SDK real).
export type AgentInvoker = (input: {
  system: string;
  user: string;
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

export class ClaudeProvider implements ExtractionProvider {
  constructor(private readonly invoker: AgentInvoker) {}

  async extrair(ctx: ExtractionContext): Promise<ExtractionResult> {
    const contexto = ctx.contextoCanonico ?? { metas_ativas: ctx.metasAtivas };
    const user = buildUserMessage({
      notaConsolidada: ctx.notaConsolidada,
      contexto,
    });

    const modoObj = contexto as { modo?: string } | undefined;
    const systemPrompt =
      modoObj?.modo === "terapia_convencional"
        ? CONVENTIONAL_SYSTEM_PROMPT
        : SYSTEM_PROMPT;

    // Lança em erro de LLM (o caller trata como pendente_reprocessamento).
    const bruto = await this.invoker({ system: systemPrompt, user });

    // Valida contra o contrato (output-schema.json em zod). Lança se o modelo
    // alucinou a forma — nunca gravamos saída fora do schema.
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

// Invoker de produção: chama a API da Anthropic com tool_use forçado. NÃO é
// coberto por unit test (chamada viva) — é validado pela bake-off (dado
// fictício) e pelo teste de integração inline. Modelo default: Claude Sonnet.
export function createAnthropicInvoker(
  model = "claude-sonnet-5",
): AgentInvoker {
  return async ({ system, user }) => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: [
        {
          name: "registrar_extracao",
          description:
            "Registra a extração estruturada da sessão conforme o schema.",
          input_schema: TOOL_INPUT_SCHEMA as { type: "object" } & Record<
            string,
            unknown
          >,
        },
      ],
      tool_choice: { type: "tool", name: "registrar_extracao" },
      messages: [{ role: "user", content: user }],
    });
    const block = resp.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("Anthropic não retornou tool_use.");
    }
    return block.input;
  };
}
