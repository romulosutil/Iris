import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import { TOOL_INPUT_SCHEMA, type AgentInvoker } from "./llm-provider";

/**
 * Invoker de produção da extração real (D57): `resolveProvider`
 * (src/lib/extraction/provider.ts) chama `createGeminiInvoker(modeloDeExtracao())`
 * quando `EXTRACTION_LLM_ENABLED=true` e `GOOGLE_API_KEY` presente. O id do
 * modelo de produção vem de `GOOGLE_EXTRACTION_MODEL` (ver `provider.ts`), NÃO
 * do default desta função.
 *
 * Também é usado pela suíte `#395` (`casos-clinicos.llm.test.ts`) SEM
 * argumento — decisão de produto do Rômulo (18/08/26): aquela suíte roda
 * contra um modelo mais barato (`gemini-2.0-flash` por padrão, override via
 * `GEMINI_TEST_MODEL`) porque é uma suíte cara de chamadas reais; o modelo
 * de produção é escolhido explicitamente por quem chama `createGeminiInvoker`
 * com o argumento `model`, não pelo default desta função.
 *
 * Reusa o MESMO `TOOL_INPUT_SCHEMA` (derivado de `agentOutputObjectSchema`
 * via zodToJsonSchema, definido uma única vez em llm-provider.ts) via
 * `parametersJsonSchema` — campo do SDK do Gemini que aceita JSON Schema
 * cru (inclui `additionalProperties`, `nullable`, tipos em minúsculo), sem
 * precisar reescrever o schema no formato `Schema`/`Type` (enum maiúsculo)
 * que `parameters` exigiria.
 *
 * DA-02 (#535): devolve `{ payload, meta }`. `usageMetadata` era descartado —
 * modelo, latência e tokens nunca chegavam ao banco, e "≥70% de aprovação
 * sem edição" (PRODUCT.md) não tinha como ser medido por modelo/prompt.
 * `tokensSaida` soma candidatos + pensamento (`thoughtsTokenCount`): ambos
 * são cobrados como saída. Sem `usageMetadata`, tokens ficam `null` — zero
 * seria afirmar um custo que não medimos.
 *
 * A-03 (#535): `signal` é repassado ao SDK (`config.abortSignal`) para o
 * timeout de `invocarComResiliencia` cancelar a requisição HTTP de verdade.
 */

const NOME_FERRAMENTA = "registrar_extracao";

function somaOuNull(...valores: Array<number | undefined>): number | null {
  const definidos = valores.filter((v): v is number => typeof v === "number");
  if (definidos.length === 0) return null;
  return definidos.reduce((a, b) => a + b, 0);
}

export function createGeminiInvoker(
  model: string = process.env.GEMINI_TEST_MODEL || "gemini-2.0-flash",
): AgentInvoker {
  return async ({ system, user, signal }) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_API_KEY ausente — createGeminiInvoker precisa da chave real.",
      );
    }
    const client = new GoogleGenAI({ apiKey });
    const inicio = Date.now();
    const resp = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: {
        abortSignal: signal,
        systemInstruction: system,
        tools: [
          {
            functionDeclarations: [
              {
                name: NOME_FERRAMENTA,
                description:
                  "Registra a extração estruturada da sessão conforme o schema.",
                parametersJsonSchema: TOOL_INPUT_SCHEMA,
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [NOME_FERRAMENTA],
          },
        },
      },
    });
    const latenciaMs = Date.now() - inicio;

    const chamada = resp.functionCalls?.[0];
    if (!chamada || chamada.name !== NOME_FERRAMENTA) {
      throw new Error(
        `Gemini não retornou function call de "${NOME_FERRAMENTA}".`,
      );
    }
    const uso = resp.usageMetadata;
    return {
      payload: chamada.args,
      meta: {
        modelo: model,
        latenciaMs,
        tokensEntrada: somaOuNull(uso?.promptTokenCount),
        tokensSaida: somaOuNull(
          uso?.candidatesTokenCount,
          uso?.thoughtsTokenCount,
        ),
      },
    };
  };
}
