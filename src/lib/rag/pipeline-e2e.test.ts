import { describe, it, expect } from "vitest";
import {
  processarEIndexarDossieClinico,
  InMemoryVectorStore,
  DeterministicStubEmbeddingProvider,
  HybridClinicalRetriever,
  projetarHistoricoRelevante,
  construirParSft,
  construirParDpo,
  particionarDatasetAntiLeakage,
  exportarOpenAiMessagesJsonl,
  exportarDpoJsonl,
  calcularOrcamentoContexto,
  type DadosExportComContexto,
} from "./index";

describe("Integração E2E: Pipeline Completo de RAG e Treinamento Clínico (D11 / Issue #120)", () => {
  it("executa o ciclo completo: exportação -> higienização -> indexação -> busca RAG -> treino SFT/DPO", async () => {
    const store = new InMemoryVectorStore();
    const embeddingProvider = new DeterministicStubEmbeddingProvider(64);
    const retriever = new HybridClinicalRetriever(store, embeddingProvider);

    // 1. Dossiê Clínico Exportado com dados sensíveis
    const dossiePacienteA: DadosExportComContexto = {
      clinicId: "clinica-terapeuta-pro",
      patientId: "paciente-pedro-01",
      nomePaciente: "Pedro Lucas Alves",
      nomeSolicitante: "Mariana Alves",
      cpfSolicitante: "333.444.555-66",
      timestampEmissao: new Date("2026-08-16T14:00:00Z"),
      modality: "aba",
      disciplina: "psicologia",
      secoes: [
        {
          titulo: "1. Plano Terapêutico Singular (PTS)",
          conteudo:
            "Metas ativas: Mando vocal independente de itens de interesse (água, bola, carrinho).",
        },
        {
          titulo: "2. Histórico de Evoluções Clínicas Factuais",
          conteudo:
            "Sessão 1: Pedro Lucas Alves realizou 10 tentativas de mando para bola com dica_verbal. Mãe Mariana Alves acompanhou.",
        },
        {
          titulo: "3. Evolução da Sessão de 14/08/2026",
          conteudo:
            "Sessão 2: Pedro Lucas Alves evoluiu para mando independente de água (4/4 acertos). Sem choro ou fuga de demanda.",
        },
      ],
    };

    // 2. Ingestão, Sanitização LGPD e Indexação
    const resultadoIngestao = await processarEIndexarDossieClinico(
      dossiePacienteA,
      store,
      embeddingProvider,
    );

    expect(resultadoIngestao.totalChunksIndexados).toBe(3);
    for (const chunk of resultadoIngestao.chunks) {
      expect(chunk.conteudo).not.toContain("Pedro Lucas Alves");
      expect(chunk.conteudo).not.toContain("333.444.555-66");
    }

    // 3. Orçamento de Contexto para a Sessão
    const orcamento = calcularOrcamentoContexto({
      limiteTotal: 4096,
      tokensSistema: 1000,
      tokensSessaoAtual: 500,
      margemSeguranca: 200,
    });
    expect(orcamento.tokensDisponiveisRag).toBe(2396);

    // 4. Consulta RAG (Recuperação Híbrida)
    const buscaRag = await retriever.buscarHibrido({
      textoConsulta: "evolução de mando independente de água",
      filtro: {
        clinicId: "clinica-terapeuta-pro",
        patientId: "paciente-pedro-01",
      },
      limite: 2,
    });

    expect(buscaRag.length).toBeGreaterThan(0);
    expect(buscaRag[0]!.chunk.metadata.clinicId).toBe("clinica-terapeuta-pro");

    // 5. Projeção canônica para historico_relevante (Camada 1)
    const historicoRelevante = projetarHistoricoRelevante(
      buscaRag.map((r) => r.chunk),
    );
    expect(historicoRelevante.length).toBeGreaterThan(0);
    expect(historicoRelevante[0]).toHaveProperty("dominio_id");
    expect(historicoRelevante[0]).toHaveProperty("protocol_id");
    expect(historicoRelevante[0]).toHaveProperty("resumo");

    // 6. Geração de Pares de Treinamento SFT e DPO
    const parSft = construirParSft({
      id: "train-sft-01",
      patientId: "paciente-pedro-01",
      sessionId: "sess-02",
      modality: "aba",
      systemPrompt: "Você é o Agente de Extração Clínica",
      diarioTexto:
        "Pedro pediu água de forma independente 4 vezes durante a sessão.",
      extracoesAprovadas: [
        {
          alvo: "mando-agua",
          nivel_ajuda: "independente",
          resultado: "acerto",
          tentativas: 4,
        },
      ],
    });

    const parDpo = construirParDpo({
      id: "train-dpo-01",
      patientId: "paciente-pedro-01",
      sessionId: "sess-02",
      prompt: "Pedro pediu água de forma independente",
      chosen: JSON.stringify({
        nivel_ajuda: "independente",
        resultado: "acerto",
      }),
      rejected: JSON.stringify({
        nivel_ajuda: "dica_verbal",
        resultado: "acerto_apos_dica",
      }),
    });

    // 7. Particionamento Anti-Leakage
    const datasetSft = particionarDatasetAntiLeakage([parSft]);
    expect(datasetSft.estatisticas.totalItens).toBe(1);
    expect(datasetSft.estatisticas.totalPacientes).toBe(1);

    // 8. Exportação JSONL
    const jsonlSft = exportarOpenAiMessagesJsonl([parSft]);
    const jsonlDpo = exportarDpoJsonl([parDpo]);

    expect(jsonlSft).toContain('"messages":');
    expect(jsonlDpo).toContain('"chosen":');
    expect(jsonlDpo).toContain('"rejected":');
  });
});
