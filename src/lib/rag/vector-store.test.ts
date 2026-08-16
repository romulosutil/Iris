import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryVectorStore } from "./vector-store";
import { DeterministicStubEmbeddingProvider } from "./embedding";
import type { ClinicalChunk } from "./types";

describe("Vector Store Multi-Tenant com Isolamento RLS", () => {
  let store: InMemoryVectorStore;
  let embeddingProvider: DeterministicStubEmbeddingProvider;

  beforeEach(() => {
    store = new InMemoryVectorStore();
    embeddingProvider = new DeterministicStubEmbeddingProvider(64);
  });

  it("exige clinicId obrigatoriamente e bloqueia inserções/buscas sem tenant (Guardrail RLS)", async () => {
    const chunk: ClinicalChunk = {
      id: "chk-1",
      conteudo: "conteudo de teste",
      conteudoOriginalSanitizado: "conteudo de teste",
      tokenCount: 5,
      metadata: {
        clinicId: "", // VAZIO
        patientId: "pat-1",
        tipoSecao: "evolucao_sessao",
      },
      cabecalhoContextual: "[METADADOS]",
    };

    const vetor = await embeddingProvider.gerarEmbedding(chunk.conteudo);

    // Tentativa de inserção sem clinicId deve lançar erro
    await expect(store.inserir(chunk, vetor)).rejects.toThrow(
      /clinicId é obrigatório/,
    );

    // Tentativa de busca sem clinicId deve lançar erro
    // @ts-expect-error testando ausência de clinicId em runtime
    await expect(store.buscarVetores(vetor, {})).rejects.toThrow(
      /clinicId é obrigatório/,
    );
  });

  it("garante isolamento estrito entre clínicas: Clínica A jamais vê vetores da Clínica B", async () => {
    const chunkClinicaA: ClinicalChunk = {
      id: "chk-a",
      conteudo: "Paciente de São Paulo realizou treino de mando vocal",
      conteudoOriginalSanitizado:
        "Paciente de São Paulo realizou treino de mando vocal",
      tokenCount: 10,
      metadata: {
        clinicId: "clinica-sp",
        patientId: "paciente-1",
        tipoSecao: "evolucao_sessao",
      },
      cabecalhoContextual: "[METADADOS: CLINICA=clinica-sp]",
    };

    const chunkClinicaB: ClinicalChunk = {
      id: "chk-b",
      conteudo: "Paciente do Rio de Janeiro realizou treino de mando vocal",
      conteudoOriginalSanitizado:
        "Paciente do Rio de Janeiro realizou treino de mando vocal",
      tokenCount: 10,
      metadata: {
        clinicId: "clinica-rj",
        patientId: "paciente-2",
        tipoSecao: "evolucao_sessao",
      },
      cabecalhoContextual: "[METADADOS: CLINICA=clinica-rj]",
    };

    const vetA = await embeddingProvider.gerarEmbedding(chunkClinicaA.conteudo);
    const vetB = await embeddingProvider.gerarEmbedding(chunkClinicaB.conteudo);

    await store.inserir(chunkClinicaA, vetA);
    await store.inserir(chunkClinicaB, vetB);

    // Consulta com filtro de clinica-sp
    const resultadosA = await store.buscarVetores(vetA, {
      clinicId: "clinica-sp",
    });
    expect(resultadosA).toHaveLength(1);
    expect(resultadosA[0]!.chunk.id).toBe("chk-a");
    expect(resultadosA[0]!.chunk.metadata.clinicId).toBe("clinica-sp");

    // Consulta com filtro de clinica-rj
    const resultadosB = await store.buscarVetores(vetA, {
      clinicId: "clinica-rj",
    });
    expect(resultadosB).toHaveLength(1);
    expect(resultadosB[0]!.chunk.id).toBe("chk-b");
    expect(resultadosB[0]!.chunk.metadata.clinicId).toBe("clinica-rj");

    // Consulta com clinica inexistente retorna vazio
    const resultadosC = await store.buscarVetores(vetA, {
      clinicId: "clinica-inexistente",
    });
    expect(resultadosC).toHaveLength(0);
  });

  it("permite filtragem por paciente, domínio e modalidade clínica", async () => {
    const chunk1: ClinicalChunk = {
      id: "chk-1",
      conteudo: "Treino de fonoaudiologia para ecoico",
      conteudoOriginalSanitizado: "Treino de fonoaudiologia para ecoico",
      tokenCount: 8,
      metadata: {
        clinicId: "clinica-alpha",
        patientId: "paciente-10",
        modality: "fonoaudiologia",
        tipoSecao: "evolucao_sessao",
        dominios: ["ecoico"],
      },
      cabecalhoContextual: "[METADADOS]",
    };

    const chunk2: ClinicalChunk = {
      id: "chk-2",
      conteudo: "Treino de terapia ocupacional para AVD",
      conteudoOriginalSanitizado: "Treino de terapia ocupacional para AVD",
      tokenCount: 8,
      metadata: {
        clinicId: "clinica-alpha",
        patientId: "paciente-10",
        modality: "terapia_ocupacional",
        tipoSecao: "evolucao_sessao",
        dominios: ["avd"],
      },
      cabecalhoContextual: "[METADADOS]",
    };

    await store.inserir(
      chunk1,
      await embeddingProvider.gerarEmbedding(chunk1.conteudo),
    );
    await store.inserir(
      chunk2,
      await embeddingProvider.gerarEmbedding(chunk2.conteudo),
    );

    const consultaVetor = await embeddingProvider.gerarEmbedding("ecoico");

    const buscaFono = await store.buscarVetores(consultaVetor, {
      clinicId: "clinica-alpha",
      modality: "fonoaudiologia",
    });

    expect(buscaFono).toHaveLength(1);
    expect(buscaFono[0]!.chunk.id).toBe("chk-1");

    const buscaTO = await store.buscarVetores(consultaVetor, {
      clinicId: "clinica-alpha",
      dominios: ["avd"],
    });

    expect(buscaTO).toHaveLength(1);
    expect(buscaTO[0]!.chunk.id).toBe("chk-2");
  });

  it("remove vetores por paciente garantindo expurgo LGPD", async () => {
    const chunk: ClinicalChunk = {
      id: "chk-del",
      conteudo: "Evolucao a ser purgada",
      conteudoOriginalSanitizado: "Evolucao a ser purgada",
      tokenCount: 5,
      metadata: {
        clinicId: "clinica-lgpd",
        patientId: "paciente-purgar",
        tipoSecao: "evolucao_sessao",
      },
      cabecalhoContextual: "[METADADOS]",
    };

    await store.inserir(
      chunk,
      await embeddingProvider.gerarEmbedding(chunk.conteudo),
    );
    expect(await store.contar({ clinicId: "clinica-lgpd" })).toBe(1);

    const removidos = await store.removerPorPaciente(
      "clinica-lgpd",
      "paciente-purgar",
    );
    expect(removidos).toBe(1);
    expect(await store.contar({ clinicId: "clinica-lgpd" })).toBe(0);
  });
});
