import { describe, it, expect, beforeEach } from "vitest";
import {
  HybridClinicalRetriever,
  calcularRRF,
  aplicarMMR,
  projetarHistoricoRelevante,
} from "./retriever";
import { InMemoryVectorStore } from "./vector-store";
import { MockEmbeddingProvider } from "./embedding";
import type { ClinicalChunk } from "./types";

describe("Retriever Híbrido, RRF e Projeção de Contexto Clínico", () => {
  let store: InMemoryVectorStore;
  let embeddingProvider: MockEmbeddingProvider;
  let retriever: HybridClinicalRetriever;

  beforeEach(() => {
    store = new InMemoryVectorStore();
    embeddingProvider = new MockEmbeddingProvider(3);
    retriever = new HybridClinicalRetriever(store, embeddingProvider);
  });

  it("calcula RRF (Reciprocal Rank Fusion) combinando rankings denso e esparso", () => {
    const score = calcularRRF(1, 2, 60);
    // 1/(60+1) + 1/(60+2) = 1/61 + 1/62
    expect(score).toBeCloseTo(1 / 61 + 1 / 62, 5);
  });

  it("executa busca híbrida (Dense + BM25) retornando resultados ordenados por RRF", async () => {
    const chunk1: ClinicalChunk = {
      id: "c1",
      conteudo:
        "[METADADOS: CLINICA=c1 | PACIENTE=p1 | TIPO=evolucao_sessao]\nPaciente realizou treino de mando de suco.",
      conteudoOriginalSanitizado: "Paciente realizou treino de mando de suco.",
      tokenCount: 10,
      metadata: {
        clinicId: "c1",
        patientId: "p1",
        tipoSecao: "evolucao_sessao",
        dominios: ["mando"],
      },
      cabecalhoContextual: "[METADADOS]",
    };

    const chunk2: ClinicalChunk = {
      id: "c2",
      conteudo:
        "[METADADOS: CLINICA=c1 | PACIENTE=p1 | TIPO=evolucao_sessao]\nTreino de tato nomeando animais da fazenda.",
      conteudoOriginalSanitizado: "Treino de tato nomeando animais da fazenda.",
      tokenCount: 10,
      metadata: {
        clinicId: "c1",
        patientId: "p1",
        tipoSecao: "evolucao_sessao",
        dominios: ["tato"],
      },
      cabecalhoContextual: "[METADADOS]",
    };

    // Configura embeddings: chunk1 tem maior afinidade com a consulta "treino de mando"
    embeddingProvider.definirEmbedding(chunk1.conteudo, [1.0, 0.0, 0.0]);
    embeddingProvider.definirEmbedding(chunk2.conteudo, [0.0, 1.0, 0.0]);
    embeddingProvider.definirEmbedding("treino de mando", [1.0, 0.0, 0.0]);

    const vet1 = await embeddingProvider.gerarEmbedding(chunk1.conteudo);
    const vet2 = await embeddingProvider.gerarEmbedding(chunk2.conteudo);

    await store.inserir(chunk1, vet1);
    await store.inserir(chunk2, vet2);

    const resultados = await retriever.buscarHibrido({
      textoConsulta: "treino de mando",
      filtro: { clinicId: "c1", patientId: "p1" },
      limite: 5,
    });

    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados[0]!.chunk.id).toBe("c1");
    expect(resultados[0]!.rrfScore).toBeDefined();
    expect(resultados[0]!.rrfScore!).toBeGreaterThan(0);
  });

  it("aplica MMR para diversificar resultados e evitar redundância de sessões idênticas", () => {
    const chunks: ClinicalChunk[] = [
      {
        id: "c-rep1",
        conteudo: "Paciente realizou mando de agua independente",
        conteudoOriginalSanitizado:
          "Paciente realizou mando de agua independente",
        tokenCount: 6,
        metadata: {
          clinicId: "c1",
          patientId: "p1",
          tipoSecao: "evolucao_sessao",
        },
        cabecalhoContextual: "",
      },
      {
        id: "c-rep2",
        conteudo:
          "Paciente realizou mando de agua independente na sessão seguinte",
        conteudoOriginalSanitizado:
          "Paciente realizou mando de agua independente na sessão seguinte",
        tokenCount: 8,
        metadata: {
          clinicId: "c1",
          patientId: "p1",
          tipoSecao: "evolucao_sessao",
        },
        cabecalhoContextual: "",
      },
      {
        id: "c-div",
        conteudo: "Fonoaudiologia trabalhou motricidade orofacial e mastigacao",
        conteudoOriginalSanitizado:
          "Fonoaudiologia trabalhou motricidade orofacial e mastigacao",
        tokenCount: 7,
        metadata: {
          clinicId: "c1",
          patientId: "p1",
          tipoSecao: "evolucao_sessao",
        },
        cabecalhoContextual: "",
      },
    ];

    // Vetor de consulta multifacetado [1, 1, 0] (busca comunicação + motricidade)
    const vetorConsulta = [1, 1, 0];

    // c-rep1 e c-rep2 cobrem o eixo 1 (comunicação)
    // c-div cobre o eixo 2 (motricidade)
    const vetores = [
      [1.0, 0.0, 0.0],
      [0.99, 0.05, 0.0],
      [0.05, 1.0, 0.0],
    ];

    const selecionados = aplicarMMR({
      chunks,
      vetores,
      vetorConsulta,
      limite: 2,
      lambda: 0.7,
    });

    expect(selecionados).toHaveLength(2);
    // MMR seleciona um do eixo 1 e inclui obrigatoriamente o diversificado (c-div)
    const ids = selecionados.map((s) => s.id);
    expect(ids).toContain("c-div");
    // Apenas uma das repetições deve estar presente (não ambas)
    const contemRep1 = ids.includes("c-rep1");
    const contemRep2 = ids.includes("c-rep2");
    expect(contemRep1 !== contemRep2).toBe(true);
  });

  it("projeta chunks recuperados diretamente para a estrutura canônica de historico_relevante", () => {
    const chunks: ClinicalChunk[] = [
      {
        id: "c1",
        conteudo: "Relato 1",
        conteudoOriginalSanitizado:
          "Paciente realizou tato independente de 5 figuras",
        tokenCount: 8,
        metadata: {
          clinicId: "c1",
          patientId: "p1",
          tipoSecao: "evolucao_sessao",
          dominios: ["tato"],
          protocoloFamilia: "vbmapp",
        },
        cabecalhoContextual: "",
      },
      {
        id: "c2",
        conteudo: "Relato 2",
        conteudoOriginalSanitizado:
          "Terapia ocupacional treinou vestuário e calçar sapatos",
        tokenCount: 8,
        metadata: {
          clinicId: "c1",
          patientId: "p1",
          tipoSecao: "evolucao_sessao",
          dominios: ["avd_vestuario"],
          protocoloFamilia: "pedi",
        },
        cabecalhoContextual: "",
      },
    ];

    const historico = projetarHistoricoRelevante(chunks);

    expect(historico).toHaveLength(2);
    expect(historico[0]).toEqual({
      dominio_id: "tato",
      protocol_id: "vbmapp",
      resumo: "Paciente realizou tato independente de 5 figuras",
    });
    expect(historico[1]).toEqual({
      dominio_id: "avd_vestuario",
      protocol_id: "pedi",
      resumo: "Terapia ocupacional treinou vestuário e calçar sapatos",
    });
  });
});
