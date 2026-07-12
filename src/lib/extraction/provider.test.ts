import { afterEach, describe, expect, test } from "vitest";
import { resolveProvider } from "./provider";
import { ClaudeProvider } from "./claude-provider";
import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";

const ctx = {
  sessionId: "s1", clinicId: "c1",
  notaConsolidada: "Pediu água apontando; falou 'á' sozinho. Depois não respondeu à pergunta.",
  metasAtivas: [{ id: "g1", descricao: "Pedir água sozinho" }],
};

describe("resolveProvider", () => {
  afterEach(() => {
    delete process.env.EXTRACTION_LLM_ENABLED;
  });

  test("clínica demo usa o DemoStubProvider", () => {
    expect(resolveProvider({ isDemo: true })).toBeInstanceOf(DemoStubProvider);
  });

  test("produção SEM a flag de DPA/LLM habilitada usa o NullProvider (guardrail)", () => {
    delete process.env.EXTRACTION_LLM_ENABLED;
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(NullProvider);
  });

  test("produção COM flag + chave habilitada usa o ClaudeProvider real", () => {
    process.env.EXTRACTION_LLM_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(ClaudeProvider);
  });

  test("flag ligada mas SEM chave cai no NullProvider (não chama LLM sem credencial)", () => {
    process.env.EXTRACTION_LLM_ENABLED = "true";
    const keySalva = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(NullProvider);
    if (keySalva) process.env.ANTHROPIC_API_KEY = keySalva;
  });
});

describe("NullProvider", () => {
  test("não gera sugestão; marca a extração como pendente de reprocessamento", async () => {
    const drafts = await new NullProvider().extrair(ctx);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.estado).toBe("pendente_reprocessamento");
    expect(drafts[0]!.subtipo).toBe("pendente");
  });
});

describe("DemoStubProvider", () => {
  test("gera >=1 extração fake 'sugerida' ligada a texto da nota", async () => {
    const drafts = await new DemoStubProvider().extrair(ctx);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.every((d) => d.estado === "sugerida")).toBe(true);
    // determinístico: mesmo input → mesma quantidade
    const again = await new DemoStubProvider().extrair(ctx);
    expect(again.length).toBe(drafts.length);
    // trecho_fonte vem do texto da nota (fatia real, não inventada)
    expect(ctx.notaConsolidada).toContain(drafts[0]!.trechoFonte);
  });
});
