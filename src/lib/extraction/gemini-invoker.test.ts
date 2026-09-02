import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// DA-02 (#535): o invoker de produção devolve `{ payload, meta }` — antes
// descartava `usageMetadata` e o modelo/latência nunca chegavam ao banco.
// O SDK é dublê: nenhuma chamada real sai daqui.
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  FunctionCallingConfigMode: { ANY: "ANY" },
}));

const RESPOSTA_OK = {
  functionCalls: [{ name: "registrar_extracao", args: { extracoes: [] } }],
  usageMetadata: {
    promptTokenCount: 1234,
    candidatesTokenCount: 56,
    thoughtsTokenCount: 10,
  },
};

describe("createGeminiInvoker", () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = "AIza-test";
    generateContent.mockReset();
  });
  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
    vi.useRealTimers();
  });

  test("devolve payload (args da function call) + meta com modelo, latência e tokens", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 850));
      return RESPOSTA_OK;
    });
    const { createGeminiInvoker } = await import("./gemini-invoker");
    const invoker = createGeminiInvoker("gemini-x-flash");
    const p = invoker({ system: "S", user: "U" });
    await vi.advanceTimersByTimeAsync(850);
    const r = await p;
    expect(r.payload).toEqual({ extracoes: [] });
    expect(r.meta.modelo).toBe("gemini-x-flash");
    expect(r.meta.latenciaMs).toBe(850);
    expect(r.meta.tokensEntrada).toBe(1234);
    // saída = candidatos + pensamento (ambos cobrados como output)
    expect(r.meta.tokensSaida).toBe(66);
  });

  test("sem usageMetadata os tokens ficam null (não zero — zero seria afirmação)", async () => {
    generateContent.mockResolvedValue({
      functionCalls: RESPOSTA_OK.functionCalls,
    });
    const { createGeminiInvoker } = await import("./gemini-invoker");
    const r = await createGeminiInvoker("m")({ system: "S", user: "U" });
    expect(r.meta.tokensEntrada).toBeNull();
    expect(r.meta.tokensSaida).toBeNull();
  });

  test("repassa o AbortSignal ao SDK (é o que torna o timeout real, não só uma promessa abandonada)", async () => {
    generateContent.mockResolvedValue(RESPOSTA_OK);
    const { createGeminiInvoker } = await import("./gemini-invoker");
    const ac = new AbortController();
    await createGeminiInvoker("m")({
      system: "S",
      user: "U",
      signal: ac.signal,
    });
    const chamada = generateContent.mock.calls[0]![0] as {
      model: string;
      config: { abortSignal?: AbortSignal };
    };
    expect(chamada.model).toBe("m");
    expect(chamada.config.abortSignal).toBe(ac.signal);
  });

  test("sem function call lança (caller trata como pendente)", async () => {
    generateContent.mockResolvedValue({ functionCalls: [] });
    const { createGeminiInvoker } = await import("./gemini-invoker");
    await expect(
      createGeminiInvoker("m")({ system: "S", user: "U" }),
    ).rejects.toThrow(/function call/);
  });
});
