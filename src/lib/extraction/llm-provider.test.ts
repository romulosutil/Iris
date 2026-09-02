import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LlmExtractionProvider,
  versaoDoPrompt,
  type AgentInvoker,
} from "./llm-provider";
import { SYSTEM_PROMPT, TCC_SYSTEM_PROMPT } from "./prompt";
import { ExtracaoTimeoutError } from "./resiliencia";
import type { AgentOutput } from "./agent-output-schema";

const ctx = {
  sessionId: "s1",
  clinicId: "c1",
  notaConsolidada: "Inicialmente ela só puxava minha mão para pedir o balanço.",
  metasAtivas: [{ id: "g1", descricao: "Pedir sozinho" }],
};

const saidaValida: AgentOutput = {
  extracoes: [
    {
      tipo: "evidencia",
      confianca: "alta",
      trecho_fonte: "Inicialmente ela só puxava minha mão",
      inconsistente_com_historico: false,
      evidencia: {
        descricao: "Mando não-verbal",
        polaridade: "positiva",
        funcao: "mando",
        nivel_ajuda: "independente",
        resultado: "acerto",
      },
    },
  ],
  resumo_sessao: "1 mando não-verbal.",
  sinalizacoes: [],
};

// DA-02 (#535): o invoker devolve `{ payload, meta }`; o fake imita o
// contrato do invoker real (gemini-invoker.ts).
const META = {
  modelo: "gemini-fake",
  latenciaMs: 321,
  tokensEntrada: 100,
  tokensSaida: 20,
};
function invokerQueDevolve(payload: unknown) {
  return vi.fn<AgentInvoker>().mockResolvedValue({ payload, meta: META });
}

describe("LlmExtractionProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("mapeia a saída validada do agente para drafts 'sugerida'", async () => {
    const invoker = invokerQueDevolve(saidaValida);
    const { drafts } = await new LlmExtractionProvider(invoker).extrair(ctx);

    expect(drafts).toHaveLength(1);
    const d = drafts[0]!;
    expect(d.estado).toBe("sugerida");
    expect(d.subtipo).toBe("evidencia");
    expect(d.trechoFonte).toBe("Inicialmente ela só puxava minha mão");
    expect(d.confianca).toBe("alta");
    // payload carrega a forma do subtipo (o objeto evidencia)
    expect((d.payload as { funcao?: string }).funcao).toBe("mando");
  });

  test("passa system prompt + diário ao invoker (diário dentro do bloco de dados)", async () => {
    const invoker = invokerQueDevolve(saidaValida);
    await new LlmExtractionProvider(invoker).extrair(ctx);

    const arg = invoker.mock.calls[0]![0] as { system: string; user: string };
    expect(arg.system).toContain("R1.");
    expect(arg.user).toMatch(/<diario_do_terapeuta_[a-f0-9-]+>/);
    expect(arg.user).toContain("puxava minha mão");
  });

  test("saída vazia (nenhuma evidência) devolve zero drafts — sucesso, não falha", async () => {
    const vazio: AgentOutput = {
      extracoes: [],
      resumo_sessao: "Nada a extrair.",
    };
    const { drafts } = await new LlmExtractionProvider(
      invokerQueDevolve(vazio),
    ).extrair(ctx);
    expect(drafts).toHaveLength(0);
  });

  test("lança quando o modelo devolve saída fora do schema (caller trata como pendente)", async () => {
    const invalido = { extracoes: [{ tipo: "pontuacao", nota: 10 }] };
    const provider = new LlmExtractionProvider(invokerQueDevolve(invalido));
    await expect(provider.extrair(ctx)).rejects.toThrow();
  });

  test("lança quando o invoker (LLM) falha", async () => {
    const provider = new LlmExtractionProvider(
      vi.fn().mockRejectedValue(new Error("429 rate limit")),
    );
    await expect(provider.extrair(ctx)).rejects.toThrow();
  });

  test("lança em modo desconhecido/inválido — nunca cai em ABA por default (R3/#388)", async () => {
    const invoker = invokerQueDevolve(saidaValida);
    const provider = new LlmExtractionProvider(invoker);
    const ctxComModoInvalido = {
      ...ctx,
      contextoCanonico: { modo: "modo_inexistente" },
    };
    await expect(provider.extrair(ctxComModoInvalido)).rejects.toThrow(
      /Modo de extração desconhecido/,
    );
    expect(invoker).not.toHaveBeenCalled();
  });

  test("modo 'tcc' usa o TCC_SYSTEM_PROMPT", async () => {
    const invoker = invokerQueDevolve(saidaValida);
    const ctxTcc = { ...ctx, contextoCanonico: { modo: "tcc" } };
    await new LlmExtractionProvider(invoker).extrair(ctxTcc);

    const arg = invoker.mock.calls[0]![0] as { system: string; user: string };
    expect(arg.system).toContain("R1-TC.");
    expect(arg.system).toContain("TERAPIA COGNITIVO-COMPORTAMENTAL");
  });

  // ── DA-02 (#535): meta da chamada viaja junto com os drafts ──────────────
  test("propaga meta do invoker + prompt_versao (hash do system prompt usado)", async () => {
    const { meta } = await new LlmExtractionProvider(
      invokerQueDevolve(saidaValida),
      { modelo: "gemini-fake" },
    ).extrair(ctx);
    expect(meta).toEqual({
      modelo: "gemini-fake",
      promptVersao: versaoDoPrompt(SYSTEM_PROMPT),
      latenciaMs: expect.any(Number),
      tokensEntrada: 100,
      tokensSaida: 20,
    });
  });

  test("prompt_versao acompanha o prompt do modo (tcc ≠ aba) e é estável entre chamadas", async () => {
    const provider = new LlmExtractionProvider(invokerQueDevolve(saidaValida));
    const aba = await provider.extrair(ctx);
    const tcc = await provider.extrair({
      ...ctx,
      contextoCanonico: { modo: "tcc" },
    });
    expect(aba.meta?.promptVersao).toBe(versaoDoPrompt(SYSTEM_PROMPT));
    expect(tcc.meta?.promptVersao).toBe(versaoDoPrompt(TCC_SYSTEM_PROMPT));
    expect(aba.meta?.promptVersao).not.toBe(tcc.meta?.promptVersao);
    expect(versaoDoPrompt(SYSTEM_PROMPT)).toMatch(/^[a-f0-9]{12}$/);
  });

  test("expõe `modelo` para o caller gravar mesmo quando a chamada falha", () => {
    expect(
      new LlmExtractionProvider(invokerQueDevolve(saidaValida), {
        modelo: "gemini-fake",
      }).modelo,
    ).toBe("gemini-fake");
  });

  // ── A-03 (#535): timeout e retry ficam DENTRO do provider — qualquer
  //    invoker (real ou fake) herda a política. ─────────────────────────────
  test("invoker que nunca responde falha com EXTRACAO_TIMEOUT após 45 s (+1 retry)", async () => {
    vi.useFakeTimers();
    const invoker = vi.fn<AgentInvoker>(() => new Promise(() => {}));
    const p = new LlmExtractionProvider(invoker).extrair(ctx);
    const resultado = p.then(
      () => "resolveu",
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(45_000 + 2_000 + 45_000);
    const err = (await resultado) as Error;
    expect(err).toBeInstanceOf(ExtracaoTimeoutError);
    expect(err.name).toBe("EXTRACAO_TIMEOUT");
    expect(invoker).toHaveBeenCalledTimes(2);
    // o signal chega ao invoker: é ele que cancela a requisição HTTP real
    expect(invoker.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
  });

  test("1ª chamada 503, 2ª ok: devolve drafts e latência total (inclui backoff)", async () => {
    vi.useFakeTimers();
    const e503 = Object.assign(new Error("overloaded"), { status: 503 });
    const invoker = vi
      .fn<AgentInvoker>()
      .mockRejectedValueOnce(e503)
      .mockResolvedValueOnce({ payload: saidaValida, meta: META });
    const p = new LlmExtractionProvider(invoker).extrair(ctx);
    await vi.advanceTimersByTimeAsync(2_000);
    const { drafts, meta } = await p;
    expect(drafts).toHaveLength(1);
    expect(invoker).toHaveBeenCalledTimes(2);
    expect(meta?.latenciaMs).toBe(2_000);
    expect(meta?.tokensEntrada).toBe(100);
  });

  test("4xx (modelo aposentado) NÃO re-tenta", async () => {
    const e404 = Object.assign(new Error("NOT_FOUND"), { status: 404 });
    const invoker = vi.fn<AgentInvoker>().mockRejectedValue(e404);
    await expect(new LlmExtractionProvider(invoker).extrair(ctx)).rejects.toBe(
      e404,
    );
    expect(invoker).toHaveBeenCalledTimes(1);
  });
});
