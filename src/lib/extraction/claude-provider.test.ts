import { describe, expect, test, vi } from "vitest";
import { ClaudeProvider } from "./claude-provider";
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
