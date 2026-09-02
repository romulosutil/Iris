import { createHash } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  ExtractionContext,
  ExtractionMeta,
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
  TCC_SYSTEM_PROMPT,
  buildUserMessage,
} from "./prompt";
import { invocarComResiliencia } from "./resiliencia";

// Tool schema DERIVADO do contrato zod (fonte única de verdade) — guia o modelo
// aos enums/campos obrigatórios exatos. Sem isto, o modelo inventa formas (ex.:
// tipo "evidencia_comportamental", confianca ausente — achado do teste vivo).
// Deriva do OBJETO, não do schema com preprocess: um ZodEffects não gera JSON
// Schema confiável. O preprocess só normaliza a forma R20 na ENTRADA — o que o
// modelo deve produzir é exatamente o objeto.
// Exportado (não só local): o invoker do Gemini (gemini-invoker.ts) reusa o
// MESMO schema derivado — nunca duplica a chamada zodToJsonSchema.
export const TOOL_INPUT_SCHEMA = zodToJsonSchema(agentOutputObjectSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

export type AgentInvokerInput = {
  system: string;
  user: string;
  /** A-03 (#535): aborta a requisição HTTP quando o timeout estoura. */
  signal?: AbortSignal;
};

/** DA-02 (#535): o que o invoker mediu na chamada. `latenciaMs` aqui é de UMA
 * chamada; o provider substitui pelo tempo total (com retry) antes de devolver. */
export type AgentInvokerMeta = {
  modelo: string;
  latenciaMs: number;
  tokensEntrada: number | null;
  tokensSaida: number | null;
};

export type AgentInvokerResult = {
  /** Input CRU da ferramenta registrar_extracao (ainda não validado). */
  payload: unknown;
  meta: AgentInvokerMeta;
};

// Abstração do modelo: recebe system+user, devolve o input CRU da ferramenta
// registrar_extracao (objeto JSON ainda não validado) mais a meta da chamada.
// Injetável → o unit test passa um fake; produção usa createGeminiInvoker
// (SDK real, gemini-invoker.ts).
export type AgentInvoker = (
  input: AgentInvokerInput,
) => Promise<AgentInvokerResult>;

/**
 * DA-02 (#535): versão do prompt = sha256 curto (12 hex) do texto do system
 * prompt efetivamente usado. Calculado uma vez por processo por prompt (há
 * três: ABA, convencional, TCC) — o hash de 19 KB não é caro, mas também não
 * há razão para refazê-lo a cada consolidação. Muda quando o prompt muda:
 * é o que permite comparar "aprovação sem edição" antes/depois de uma edição
 * de prompt sem depender de deploy ou de número de versão mantido à mão.
 */
const versoes = new Map<string, string>();
export function versaoDoPrompt(prompt: string): string {
  let v = versoes.get(prompt);
  if (!v) {
    v = createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 12);
    versoes.set(prompt, v);
  }
  return v;
}

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
    case "registro_pensamento":
      return e.registro_pensamento ?? {};
    case "aplicacao_escala_relatada":
      return e.aplicacao_escala_relatada ?? {};
    case "tarefa_casa":
      return e.tarefa_casa ?? {};
  }
}

export class LlmExtractionProvider implements ExtractionProvider {
  /** Modelo que este provider chama — gravado na linha
   * `pendente_reprocessamento` quando a chamada falha e não há meta. */
  readonly modelo: string | null;

  constructor(
    private readonly invoker: AgentInvoker,
    opcoes: { modelo?: string } = {},
  ) {
    this.modelo = opcoes.modelo ?? null;
  }

  async extrair(ctx: ExtractionContext): Promise<ExtractionResult> {
    const contexto = ctx.contextoCanonico ?? { metas_ativas: ctx.metasAtivas };
    const user = buildUserMessage({
      notaConsolidada: ctx.notaConsolidada,
      contexto,
    });

    // Switch exaustivo (R3/#388): modo desconhecido/inválido LANÇA — nunca cai
    // em ABA por default. `undefined` e "protocol_driven" são os únicos casos
    // que resolvem para o SYSTEM_PROMPT (ABA).
    const modoObj = contexto as { modo?: string } | undefined;
    const modo = modoObj?.modo;
    let systemPrompt: string;
    switch (modo) {
      case "terapia_convencional":
        systemPrompt = CONVENTIONAL_SYSTEM_PROMPT;
        break;
      case "tcc":
        systemPrompt = TCC_SYSTEM_PROMPT;
        break;
      case "protocol_driven":
      case undefined:
        systemPrompt = SYSTEM_PROMPT;
        break;
      default:
        throw new Error(`Modo de extração desconhecido: "${modo}".`);
    }

    // Lança em erro de LLM (o caller trata como pendente_reprocessamento).
    // A-03: timeout de 45 s + 1 retry só para transitório (resiliencia.ts).
    const { resultado, latenciaMs } = await invocarComResiliencia((signal) =>
      this.invoker({ system: systemPrompt, user, signal }),
    );

    // Valida contra o contrato (output-schema.json em zod). Lança se o modelo
    // alucinou a forma — nunca gravamos saída fora do schema.
    const saida = agentOutputSchema.parse(resultado.payload);

    const meta: ExtractionMeta = {
      modelo: resultado.meta.modelo ?? this.modelo,
      promptVersao: versaoDoPrompt(systemPrompt),
      // total com retry/backoff, não a última chamada isolada
      latenciaMs,
      tokensEntrada: resultado.meta.tokensEntrada ?? null,
      tokensSaida: resultado.meta.tokensSaida ?? null,
    };

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
      meta,
    };
  }
}
