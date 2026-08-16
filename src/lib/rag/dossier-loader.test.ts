import { describe, it, expect, beforeEach } from "vitest";
import {
  converterExportParaClinicalDocument,
  processarEIndexarDossieClinico,
} from "./dossier-loader";
import { InMemoryVectorStore } from "./vector-store";
import { DeterministicStubEmbeddingProvider } from "./embedding";
import type { DadosProntuarioExport } from "../export/pdf-generator";

describe("Loader e Ingestor de Dossiês Clínicos Exportados", () => {
  let store: InMemoryVectorStore;
  let embeddingProvider: DeterministicStubEmbeddingProvider;

  beforeEach(() => {
    store = new InMemoryVectorStore();
    embeddingProvider = new DeterministicStubEmbeddingProvider(64);
  });

  it("converte DadosProntuarioExport em ClinicalDocument com tipagem de seções", () => {
    const dadosExport: DadosProntuarioExport = {
      patientId: "pat-99",
      nomePaciente: "Pedro Henrique Silva",
      nomeSolicitante: "Juliana Silva",
      cpfSolicitante: "999.888.777-66",
      timestampEmissao: new Date("2026-08-16T12:00:00Z"),
      secoes: [
        {
          titulo: "1. Plano Terapêutico Singular (PTS)",
          conteudo: "Metas de fonoaudiologia para articulação de fonemas.",
        },
        {
          titulo: "2. Histórico de Evoluções Clínicas Factuais",
          conteudo:
            "[Sessão 1 - 2026-08-10] Profissional: Dra. Silva\nEvolução: Paciente atingiu 80% de precisão nos fonemas /r/ e /l/.",
        },
      ],
    };

    const doc = converterExportParaClinicalDocument({
      ...dadosExport,
      clinicId: "clinica-fono",
      modality: "fonoaudiologia",
      disciplina: "fonoaudiologia",
    });

    expect(doc.id).toContain("pat-99");
    expect(doc.clinicId).toBe("clinica-fono");
    expect(doc.patientId).toBe("pat-99");
    expect(doc.modality).toBe("fonoaudiologia");
    expect(doc.secoes).toHaveLength(2);
    expect(doc.secoes[0]!.tipo).toBe("pts");
    expect(doc.secoes[1]!.tipo).toBe("evolucao_sessao");
  });

  it("executa pipeline ponta a ponta: sanitização LGPD, chunking e indexação vetorial", async () => {
    const dadosExport: DadosProntuarioExport = {
      patientId: "pat-123",
      nomePaciente: "Lucas Silva",
      nomeSolicitante: "Carla Silva",
      cpfSolicitante: "123.456.789-00",
      timestampEmissao: new Date("2026-08-16T12:00:00Z"),
      secoes: [
        {
          titulo: "1. Plano Terapêutico Singular (PTS)",
          conteudo: "Metas ativas: Mando vocal independente de água.",
        },
        {
          titulo: "2. Histórico de Evoluções Clínicas Factuais",
          conteudo:
            "Lucas Silva realizou 5 tentativas de mando independente. Carla Silva CPF 123.456.789-00 acompanhou.",
        },
      ],
    };

    const resultado = await processarEIndexarDossieClinico(
      {
        ...dadosExport,
        clinicId: "clinica-centro",
        modality: "aba",
      },
      store,
      embeddingProvider,
    );

    expect(resultado.totalChunksIndexados).toBeGreaterThan(0);
    expect(resultado.chunks.length).toBe(resultado.totalChunksIndexados);

    // Validar que o conteúdo sanitizado NÃO contém CPF nem nome real
    for (const chunk of resultado.chunks) {
      expect(chunk.conteudo).not.toContain("123.456.789-00");
      expect(chunk.conteudo).not.toContain("Lucas Silva");
      expect(chunk.metadata.clinicId).toBe("clinica-centro");
      expect(chunk.metadata.patientId).toBe("pat-123");
    }

    expect(resultado.chunks[1]!.conteudo).toContain("[CPF_REMOVIDO]");
    expect(resultado.chunks[1]!.conteudo).toContain("[PACIENTE]");
    expect(resultado.chunks[1]!.conteudo).toContain("[RESPONSAVEL]");

    // Validar que o store indexou os chunks da clínica
    const totalNoStore = await store.contar({ clinicId: "clinica-centro" });
    expect(totalNoStore).toBe(resultado.totalChunksIndexados);
  });
});
