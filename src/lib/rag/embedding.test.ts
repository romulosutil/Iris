import { describe, it, expect } from "vitest";
import {
  similaridadeCosseno,
  normalizarVetor,
  DeterministicStubEmbeddingProvider,
  MockEmbeddingProvider,
} from "./embedding";

describe("Módulo de Embeddings e Geometria Vetorial", () => {
  it("calcula similaridade de cosseno com precisão geométrica", () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];
    const v4 = [-1, 0, 0];

    expect(similaridadeCosseno(v1, v2)).toBeCloseTo(1.0, 5); // Vetores idênticos
    expect(similaridadeCosseno(v1, v3)).toBeCloseTo(0.0, 5); // Vetores ortogonais
    expect(similaridadeCosseno(v1, v4)).toBeCloseTo(-1.0, 5); // Vetores opostos
  });

  it("normaliza vetores para norma L2 unitária", () => {
    const v = [3, 4];
    const normalizado = normalizarVetor(v);
    expect(normalizado[0]).toBeCloseTo(0.6, 5);
    expect(normalizado[1]).toBeCloseTo(0.8, 5);

    const norma = Math.sqrt(normalizado[0]! ** 2 + normalizado[1]! ** 2);
    expect(norma).toBeCloseTo(1.0, 5);
  });

  it("gera embeddings determinísticos e normalizados com o stub local", async () => {
    const provider = new DeterministicStubEmbeddingProvider(384);
    expect(provider.dimensao).toBe(384);

    const emb1 = await provider.gerarEmbedding(
      "mando vocal independente de água",
    );
    const emb2 = await provider.gerarEmbedding(
      "mando vocal independente de água",
    );
    const emb3 = await provider.gerarEmbedding(
      "fuga de demanda com choro e birra",
    );

    expect(emb1).toHaveLength(384);
    // Determinismo: o mesmo texto gera exatamente o mesmo vetor
    expect(emb1).toEqual(emb2);
    expect(similaridadeCosseno(emb1, emb2)).toBeCloseTo(1.0, 5);

    // Textos diferentes geram vetores distintos
    expect(similaridadeCosseno(emb1, emb3)).toBeLessThan(0.99);
  });

  it("suporta geração de embeddings em lote", async () => {
    const provider = new DeterministicStubEmbeddingProvider(128);
    const lote = ["Texto 1", "Texto 2", "Texto 3"];
    const resultados = await provider.gerarEmbeddingsLote(lote);

    expect(resultados).toHaveLength(3);
    for (const emb of resultados) {
      expect(emb).toHaveLength(128);
    }
  });
});
