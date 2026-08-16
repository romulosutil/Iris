import { describe, it, expect } from "vitest";
import { segmentarDocumentoClinico, segmentarTextoEmJanelas } from "./chunker";
import type { ClinicalDocument } from "./types";

describe("Chunker Clínico Hierárquico e Semântico", () => {
  it("segmenta texto longo em janelas com sobreposição (overlap) respeitando limites", () => {
    const textoLongo = Array(20)
      .fill(
        "O paciente manteve contato visual durante 5 segundos diante do terapeuta.",
      )
      .join(" ");

    const janelas = segmentarTextoEmJanelas(textoLongo, {
      maxTokens: 50,
      overlapTokens: 10,
    });

    expect(janelas.length).toBeGreaterThan(1);
    for (const janela of janelas) {
      expect(janela.length).toBeGreaterThan(0);
    }
  });

  it("segmenta um ClinicalDocument preservando as seções clínicas e metadados contextuais", () => {
    const doc: ClinicalDocument = {
      id: "prontuario-001",
      clinicId: "clinica-centro",
      patientId: "paciente-777",
      timestamp: new Date("2026-08-16T10:00:00Z"),
      modality: "aba",
      disciplina: "psicologia",
      secoes: [
        {
          tipo: "pts",
          titulo: "1. Plano Terapêutico Singular",
          conteudo:
            "Objetivos ativos: Mando vocal independente de água e brinquedos. Tato de animais.",
          metas: ["mando-agua", "tato-animais"],
        },
        {
          tipo: "evolucao_sessao",
          titulo: "2. Sessão de 10/08/2026",
          conteudo:
            "Paciente realizou 8 tentativas de mando. 6 independentes e 2 com dica_verbal.",
          data: "2026-08-10",
          dominios: ["mando"],
          metas: ["mando-agua"],
        },
        {
          tipo: "evolucao_sessao",
          titulo: "3. Sessão de 12/08/2026",
          conteudo:
            "Paciente apresentou recusa e choro diante de tarefa nova de pareamento.",
          data: "2026-08-12",
          dominios: ["comportamento_disruptivo"],
        },
      ],
    };

    const chunks = segmentarDocumentoClinico(doc, {
      maxChunkTokens: 100,
      overlapTokens: 20,
    });

    expect(chunks.length).toBe(3);

    // Validar primeiro chunk (PTS)
    expect(chunks[0]!.metadata.tipoSecao).toBe("pts");
    expect(chunks[0]!.metadata.clinicId).toBe("clinica-centro");
    expect(chunks[0]!.metadata.patientId).toBe("paciente-777");
    expect(chunks[0]!.cabecalhoContextual).toContain("CLINICA=clinica-centro");
    expect(chunks[0]!.conteudo).toContain("[METADADOS:");
    expect(chunks[0]!.conteudo).toContain("Plano Terapêutico Singular");

    // Validar segundo chunk (Sessão 1)
    expect(chunks[1]!.metadata.tipoSecao).toBe("evolucao_sessao");
    expect(chunks[1]!.metadata.dataSessao).toBe("2026-08-10");
    expect(chunks[1]!.metadata.dominios).toContain("mando");

    // Validar terceiro chunk (Sessão 2)
    expect(chunks[2]!.metadata.tipoSecao).toBe("evolucao_sessao");
    expect(chunks[2]!.metadata.dataSessao).toBe("2026-08-12");
  });
});
