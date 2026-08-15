import { describe, expect, test, vi } from "vitest";
import {
  ClaudeProvider,
  TOOL_NAME_ABA,
  TOOL_NAME_CONVENCIONAL,
} from "./claude-provider";
import type { AgentOutput } from "./agent-output-schema";
import { TC2, TC4 } from "./__fixtures__/eval-terapia-convencional";

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

describe("ClaudeProvider", () => {
  test("mapeia a saída validada do agente para drafts 'sugerida'", async () => {
    const invoker = vi.fn().mockResolvedValue(saidaValida);
    const { drafts } = await new ClaudeProvider(invoker).extrair(ctx);

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
    const invoker = vi.fn().mockResolvedValue(saidaValida);
    await new ClaudeProvider(invoker).extrair(ctx);

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
    const { drafts } = await new ClaudeProvider(
      vi.fn().mockResolvedValue(vazio),
    ).extrair(ctx);
    expect(drafts).toHaveLength(0);
  });

  test("lança quando o modelo devolve saída fora do schema (caller trata como pendente)", async () => {
    const invalido = { extracoes: [{ tipo: "pontuacao", nota: 10 }] };
    const provider = new ClaudeProvider(vi.fn().mockResolvedValue(invalido));
    await expect(provider.extrair(ctx)).rejects.toThrow();
  });

  test("lança quando o invoker (LLM) falha", async () => {
    const provider = new ClaudeProvider(
      vi.fn().mockRejectedValue(new Error("429 rate limit")),
    );
    await expect(provider.extrair(ctx)).rejects.toThrow();
  });
});

// ─── Modo Terapia Convencional (#98 / achado B3 do PR #305) ──────────────────

const ctxTC = {
  ...ctx,
  notaConsolidada:
    "A Camila contou que, na última discussão com o marido, ele a segurou pelo braço com força.",
  contextoCanonico: { modo: "terapia_convencional" as const, paciente: {} },
  modo: "terapia_convencional" as const,
};

describe("ClaudeProvider — roteamento de modo (prompt, tool e contrato)", () => {
  test("modo TC envia o tool convencional; nunca o tool de extração ABA", async () => {
    const invoker = vi.fn().mockResolvedValue(TC4);
    await new ClaudeProvider(invoker).extrair(ctxTC);

    const arg = invoker.mock.calls[0]![0] as {
      system: string;
      toolName: string;
      toolSchema: { properties?: Record<string, unknown> };
    };
    expect(arg.toolName).toBe(TOOL_NAME_CONVENCIONAL);
    // O schema ENVIADO é o oráculo: sem o plumbing do P1, o tool schema ficava
    // capturado no closure do invoker de produção e o modo TC recebia o
    // contrato ABA — invisível para qualquer teste que só olhasse o prompt.
    expect(arg.toolSchema.properties).toHaveProperty("temas");
    expect(arg.toolSchema.properties).toHaveProperty(
      "padrao_participacao_verbal",
    );
    expect(arg.toolSchema.properties).not.toHaveProperty("extracoes");
    expect(arg.system).toContain("R1-TC");
  });

  test("modo protocol_driven (default) segue com o tool de extração ABA", async () => {
    const invoker = vi.fn().mockResolvedValue(saidaValida);
    await new ClaudeProvider(invoker).extrair(ctx);

    const arg = invoker.mock.calls[0]![0] as {
      toolName: string;
      toolSchema: { properties?: Record<string, unknown> };
    };
    expect(arg.toolName).toBe(TOOL_NAME_ABA);
    expect(arg.toolSchema.properties).toHaveProperty("extracoes");
    expect(arg.toolSchema.properties).not.toHaveProperty("temas");
  });

  test("`modo` tipado vence mesmo com contextoCanonico ausente", async () => {
    // Regressão do bug de plumbing: o fallback
    // `ctx.contextoCanonico ?? { metas_ativas }` apagava o modo em silêncio, e
    // o paciente convencional caía no caminho ABA sem nenhum sinal.
    const invoker = vi.fn().mockResolvedValue(TC4);
    await new ClaudeProvider(invoker).extrair({
      ...ctx,
      contextoCanonico: undefined,
      modo: "terapia_convencional",
    });

    const arg = invoker.mock.calls[0]![0] as {
      system: string;
      toolName: string;
      toolSchema: { properties?: Record<string, unknown> };
    };
    expect(arg.toolName).toBe(TOOL_NAME_CONVENCIONAL);
    expect(arg.toolSchema.properties).toHaveProperty("temas");
    expect(arg.system).toContain("R9-TC");
  });

  test("sem `modo` e sem contexto, o default é o caminho de produção (ABA)", async () => {
    const invoker = vi.fn().mockResolvedValue(saidaValida);
    await new ClaudeProvider(invoker).extrair({
      ...ctx,
      contextoCanonico: undefined,
    });
    const arg = invoker.mock.calls[0]![0] as { toolName: string };
    expect(arg.toolName).toBe(TOOL_NAME_ABA);
  });
});

describe("ClaudeProvider — modo TC grava o resumo (caso TC-2)", () => {
  test("TC-2: o alerta de violência sobrevive ao relato que minimiza", async () => {
    const invoker = vi.fn().mockResolvedValue(TC2);
    const { drafts, alertaRisco } = await new ClaudeProvider(invoker).extrair(
      ctxTC,
    );

    // 1. O alerta EXISTE. Se o parse rejeitasse a forma do alerta_risco, este
    //    `extrair` teria lançado; se o mapper lesse o campo errado, viria null.
    expect(alertaRisco).not.toBeNull();
    expect(alertaRisco!.categoria).toBe("violencia_sofrida");
    // `severidade` é o campo que resolve o prazo no banco — perdê-lo no
    // caminho é a falha que não aparece em nenhuma tela.
    expect(alertaRisco!.severidade).toBe("violencia_sofrida");
    expect(alertaRisco!.trecho_fonte).toContain("segurou pelo braço");

    // 2. O draft EXISTE. O bug B3 era exatamente este: consolidar com sucesso e
    //    não gravar artefato nenhum.
    expect(drafts).toHaveLength(1);
    const d = drafts[0]!;
    expect(d.subtipo).toBe("resumo_terapia_convencional");
    expect(d.estado).toBe("sugerida");

    // 3. O conteúdo chega inteiro no payload.
    const p = d.payload as {
      resumo_sessao: string;
      temas: Array<{ tema: string; trecho_fonte: string }>;
      padrao_participacao_verbal: { presente: boolean };
    };
    expect(p.resumo_sessao).toContain("segurou pelo braço com força");
    expect(p.temas).toHaveLength(1);
    expect(p.temas[0]!.trecho_fonte).toContain("deixou marca");
    expect(p.padrao_participacao_verbal.presente).toBe(true);
  });

  test("modo TC NUNCA devolve zero drafts em saída válida", async () => {
    // No contrato ABA `extracoes: []` é sucesso legítimo. No modo TC não
    // existe saída válida sem resumo — se um dia devolver zero drafts, é
    // porque o artefato voltou a ser descartado em silêncio.
    const { drafts } = await new ClaudeProvider(
      vi.fn().mockResolvedValue(TC4),
    ).extrair(ctxTC);
    expect(drafts).toHaveLength(1);
    expect(
      (drafts[0]!.payload as { resumo_sessao: string }).resumo_sessao,
    ).not.toBe("");
  });

  test("modo TC lança quando o modelo devolve a forma ABA (extracoes vazias)", async () => {
    // A falha silenciosa original: `{ extracoes: [], resumo_sessao }` PASSAVA
    // no contrato ABA e gravava zero artefato. No contrato do modo, lança.
    const formaAba = { extracoes: [], resumo_sessao: "Nada a extrair." };
    await expect(
      new ClaudeProvider(vi.fn().mockResolvedValue(formaAba)).extrair(ctxTC),
    ).rejects.toThrow();
  });
});
