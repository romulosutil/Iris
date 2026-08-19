import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import { TOOL_INPUT_SCHEMA, type AgentInvoker } from "./claude-provider";

/**
 * Invoker de TESTE-ONLY (#395), NUNCA de produção. `resolveProvider`
 * (src/lib/extraction/provider.ts) e `claude-provider.ts` continuam
 * 100% Anthropic, intocados — este arquivo existe só para
 * `casos-clinicos.llm.test.ts` poder chamar um provedor mais barato.
 *
 * Decisão de produto INFORMADA e EXPLÍCITA do Rômulo (18/08/26): rodar a
 * suíte #395 contra Gemini em vez de Claude/Anthropic (o modelo real de
 * produção) por custo. Isso significa que esta suíte testa "o prompt (R1-R20
 * / R1-TC..R13-TC) é seguido por UM modelo de linguagem razoável" — não
 * "o prompt é seguido pelo Claude Sonnet que roda em produção". Falha aqui
 * pode ser sinal real de prompt frágil, OU só de que o Gemini segue
 * instrução pior que o Claude nesse caso específico — as duas leituras são
 * válidas e a suíte não tenta distinguir uma da outra.
 *
 * Reusa o MESMO `TOOL_INPUT_SCHEMA` (derivado de `agentOutputObjectSchema`
 * via zodToJsonSchema, definido uma única vez em claude-provider.ts) via
 * `parametersJsonSchema` — campo do SDK do Gemini que aceita JSON Schema
 * cru (inclui `additionalProperties`, `nullable`, tipos em minúsculo), sem
 * precisar reescrever o schema no formato `Schema`/`Type` (enum maiúsculo)
 * que `parameters` exigiria. Os dois invokers (Anthropic e Gemini) partem
 * do MESMO contrato — nunca duplicamos a derivação zod→JSON Schema.
 */

const NOME_FERRAMENTA = "registrar_extracao";

export function createGeminiInvoker(
  model: string = process.env.GEMINI_TEST_MODEL || "gemini-2.0-flash",
): AgentInvoker {
  return async ({ system, user }) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_API_KEY ausente — createGeminiInvoker (test-only) precisa da chave real.",
      );
    }
    const client = new GoogleGenAI({ apiKey });
    const resp = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: {
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

    const chamada = resp.functionCalls?.[0];
    if (!chamada || chamada.name !== NOME_FERRAMENTA) {
      throw new Error(
        `Gemini não retornou function call de "${NOME_FERRAMENTA}".`,
      );
    }
    return chamada.args;
  };
}
