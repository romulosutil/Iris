import { afterEach, describe, expect, test } from "vitest";
import {
  MODELO_EXTRACAO_PADRAO,
  modeloDeExtracao,
  resolveProvider,
} from "./provider";
import { LlmExtractionProvider } from "./llm-provider";
import { DemoStubProvider } from "./demo-stub-provider";
import { NullProvider } from "./null-provider";

const ctx = {
  sessionId: "s1",
  clinicId: "c1",
  notaConsolidada:
    "Pediu água apontando; falou 'á' sozinho. Depois não respondeu à pergunta.",
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

  test("produção COM flag + chave habilitada usa o LlmExtractionProvider real", () => {
    process.env.EXTRACTION_LLM_ENABLED = "true";
    process.env.GOOGLE_API_KEY = "AIza-test";
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(
      LlmExtractionProvider,
    );
  });

  test("flag ligada mas SEM chave cai no NullProvider (não chama LLM sem credencial)", () => {
    process.env.EXTRACTION_LLM_ENABLED = "true";
    const keySalva = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    expect(resolveProvider({ isDemo: false })).toBeInstanceOf(NullProvider);
    if (keySalva) process.env.GOOGLE_API_KEY = keySalva;
  });
});

describe("modeloDeExtracao", () => {
  afterEach(() => {
    delete process.env.GOOGLE_EXTRACTION_MODEL;
  });

  test("sem a variável usa o padrão", () => {
    delete process.env.GOOGLE_EXTRACTION_MODEL;
    expect(modeloDeExtracao()).toBe(MODELO_EXTRACAO_PADRAO);
  });

  test("a variável sobrepõe o padrão (aposentadoria de id sem deploy)", () => {
    process.env.GOOGLE_EXTRACTION_MODEL = "gemini-4.0-flash";
    expect(modeloDeExtracao()).toBe("gemini-4.0-flash");
  });

  test("variável vazia/só espaço cai no padrão, não em id inválido", () => {
    process.env.GOOGLE_EXTRACTION_MODEL = "   ";
    expect(modeloDeExtracao()).toBe(MODELO_EXTRACAO_PADRAO);
  });

  // Trava de regressão do 404 de 31/08/2026: o id aposentado nunca mais pode
  // voltar a ser o padrão do código.
  test("o padrão não é o id aposentado gemini-2.5-flash", () => {
    expect(MODELO_EXTRACAO_PADRAO).not.toBe("gemini-2.5-flash");
  });
});

describe("NullProvider", () => {
  test("não gera sugestão; marca a extração como pendente de reprocessamento", async () => {
    const { drafts } = await new NullProvider().extrair(ctx);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.estado).toBe("pendente_reprocessamento");
    expect(drafts[0]!.subtipo).toBe("pendente");
  });
});

describe("DemoStubProvider", () => {
  test("gera >=1 extração fake 'sugerida' ligada a texto da nota", async () => {
    const { drafts } = await new DemoStubProvider().extrair(ctx);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.every((d) => d.estado === "sugerida")).toBe(true);
    // determinístico: mesmo input → mesma quantidade
    const { drafts: again } = await new DemoStubProvider().extrair(ctx);
    expect(again.length).toBe(drafts.length);
    // trecho_fonte vem do texto da nota (fatia real, não inventada)
    expect(ctx.notaConsolidada).toContain(drafts[0]!.trechoFonte);
  });
});
