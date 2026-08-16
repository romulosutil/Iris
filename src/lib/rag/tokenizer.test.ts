import { describe, it, expect } from "vitest";
import {
  estimarTokensTextoClinico,
  calcularOrcamentoContexto,
  truncarTextoPorTokens,
} from "./tokenizer";

describe("Tokenizador Clínico & Gestão de Orçamento de Contexto", () => {
  it("estima tokens com precisão para texto clínico em português", () => {
    const textoVazio = "";
    expect(estimarTokensTextoClinico(textoVazio)).toBe(0);

    const fraseCurta = "Paciente realizou treino de mando vocal independente.";
    const tokens = estimarTokensTextoClinico(fraseCurta);
    // 7 palavras + pontuação + morfologia em pt-BR -> aproximadamente 9 a 12 tokens
    expect(tokens).toBeGreaterThan(6);
    expect(tokens).toBeLessThan(16);
  });

  it("computa expansão proporcional para termos técnicos com acentuação e pontuações", () => {
    const textoComplexo =
      "Intervenção psicoterapêutica com análise funcional de contingências: antecedente, resposta e consequência.";
    const tokens = estimarTokensTextoClinico(textoComplexo);
    expect(tokens).toBeGreaterThan(12);
  });

  it("calcula corretamente o orçamento de contexto para RAG e limites de segurança", () => {
    const orcamento = calcularOrcamentoContexto({
      limiteTotal: 8192,
      tokensSistema: 1200,
      tokensSessaoAtual: 800,
      margemSeguranca: 500,
    });

    // 8192 - 1200 - 800 - 500 = 5692 tokens disponíveis para histórico RAG
    expect(orcamento.tokensDisponiveisRag).toBe(5692);
    expect(orcamento.tokensFixos).toBe(2000);
    expect(orcamento.limiteTotal).toBe(8192);
  });

  it("trunca texto excedente preservando o limite máximo de tokens", () => {
    const textoLongo =
      "Sessão 1: Treino de tato e ecoico com terapeuta. Sessão 2: Fonoaudiologia trabalhou diadococinesia. Sessão 3: Terapia ocupacional realizou treino de AVD e integração sensorial.";
    const truncado = truncarTextoPorTokens(textoLongo, 10);
    const tokensTruncados = estimarTokensTextoClinico(truncado);

    expect(tokensTruncados).toBeLessThanOrEqual(12);
    expect(truncado.length).toBeLessThan(textoLongo.length);
  });
});
