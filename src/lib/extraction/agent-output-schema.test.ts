import { describe, expect, test } from "vitest";
import { agentOutputSchema } from "./agent-output-schema";

// Saída mínima válida — sessão sem evidências (Caso 5: `extracoes: []` é sucesso).
const vazio = {
  extracoes: [],
  resumo_sessao: "Diário genérico, nada a extrair sem inferir.",
  sinalizacoes: [
    { tipo: "texto_ambiguo", detalhe: "Registro sem evento concreto." },
  ],
};

// Extração de evidência bem-formada (fatia do Caso 2, Sofia).
const comEvidencia = {
  extracoes: [
    {
      tipo: "evidencia",
      confianca: "alta",
      trecho_fonte: "Inicialmente ela só puxava minha mão",
      evidencia: {
        descricao: "Mando não-verbal para pedir continuação do balanço",
        polaridade: "positiva",
        funcao: "mando",
        alvos: [{ protocol_id: "vbmapp", dominio_id: "mando" }],
        nivel_ajuda: "independente",
        resultado: "acerto",
        topografia: "fisico",
        ambiente: "estruturado",
      },
    },
  ],
  resumo_sessao: "1 mando não-verbal independente.",
};

describe("agentOutputSchema", () => {
  test("aceita saída vazia (sessão sem evidências) com sinalização", () => {
    expect(agentOutputSchema.safeParse(vazio).success).toBe(true);
  });

  test("aceita extração de evidência bem-formada", () => {
    expect(agentOutputSchema.safeParse(comEvidencia).success).toBe(true);
  });

  test("aceita sinalizacoes ausente (opcional)", () => {
    const { sinalizacoes, ...semSinal } = vazio;
    expect(agentOutputSchema.safeParse(semSinal).success).toBe(true);
  });

  test("rejeita quando falta resumo_sessao (required)", () => {
    const r = agentOutputSchema.safeParse({ extracoes: [] });
    expect(r.success).toBe(false);
  });

  test("rejeita confianca fora do enum", () => {
    const bad = {
      ...comEvidencia,
      extracoes: [{ ...comEvidencia.extracoes[0], confianca: "altíssima" }],
    };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });

  test("rejeita tipo de extração fora do enum", () => {
    const bad = {
      ...comEvidencia,
      extracoes: [{ ...comEvidencia.extracoes[0], tipo: "pontuacao" }],
    };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });

  test("tolera sinalizacao com tipo desconhecido (modelo inventa rótulo) sem afundar a saída", () => {
    // Achado do teste vivo: o modelo às vezes cria um tipo de sinalização fora
    // dos 3 canônicos. Sinalizações são advisory — não podem invalidar a
    // extração clínica inteira.
    const drift = {
      extracoes: [],
      resumo_sessao: "Registro pobre.",
      sinalizacoes: [
        { tipo: "registro_pobre_em_detalhes", detalhe: "Poucos eventos concretos." },
      ],
    };
    expect(agentOutputSchema.safeParse(drift).success).toBe(true);
  });

  test("rejeita extração sem trecho_fonte (R2: sem trecho, não há extração)", () => {
    const semTrecho = { ...comEvidencia.extracoes[0] } as Record<string, unknown>;
    delete semTrecho.trecho_fonte;
    const bad = { ...comEvidencia, extracoes: [semTrecho] };
    expect(agentOutputSchema.safeParse(bad).success).toBe(false);
  });
});
