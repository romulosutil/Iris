import { describe, it, expect } from "vitest";
import {
  particionarDatasetAntiLeakage,
  construirParSft,
  construirParDpo,
  exportarOpenAiMessagesJsonl,
  exportarDpoJsonl,
  exportarShareGptJsonl,
  exportarAlpacaJsonl,
} from "./training-pipeline";
import type { SftTrainingPair, DpoTrainingPair } from "./types";

describe("Pipeline de Treinamento RAG & Geração de Datasets Clínicos", () => {
  it("particiona datasets com garantia de zero leakage por paciente (hash determinístico)", () => {
    const pares: SftTrainingPair[] = [];

    // Cria 100 sessões distribuídas entre 10 pacientes
    for (let p = 1; p <= 10; p++) {
      const patientId = `paciente-${p}`;
      for (let s = 1; s <= 10; s++) {
        pares.push({
          id: `par-${p}-${s}`,
          patientId,
          sessionId: `sess-${p}-${s}`,
          modality: "aba",
          messages: [
            { role: "system", content: "Instrução clínica" },
            { role: "user", content: `Diário da sessão ${s} do paciente ${p}` },
            { role: "assistant", content: JSON.stringify({ extracoes: [] }) },
          ],
          metadata: {
            confiancaMinima: 0.9,
            quantidadeExtracoes: 2,
            aprovadoPorTerapeuta: true,
          },
        });
      }
    }

    const split = particionarDatasetAntiLeakage(pares, {
      proporcaoTreino: 0.8,
      proporcaoVal: 0.1,
      proporcaoTeste: 0.1,
    });

    expect(split.estatisticas.totalItens).toBe(100);
    expect(split.estatisticas.totalPacientes).toBe(10);

    // Conjuntos de IDs de pacientes em cada split
    const pacientesTreino = new Set(split.train.map((item) => item.patientId));
    const pacientesVal = new Set(
      split.validation.map((item) => item.patientId),
    );
    const pacientesTeste = new Set(split.test.map((item) => item.patientId));

    // Validação Anti-Leakage: NENHUM paciente do treino pode estar em validação ou teste
    for (const pId of pacientesTreino) {
      expect(pacientesVal.has(pId)).toBe(false);
      expect(pacientesTeste.has(pId)).toBe(false);
    }

    // NENHUM paciente de validação pode estar em teste
    for (const pId of pacientesVal) {
      expect(pacientesTeste.has(pId)).toBe(false);
    }
  });

  it("constrói par SFT a partir de diário e extração aprovada por terapeuta", () => {
    const par = construirParSft({
      id: "sft-1",
      patientId: "p1",
      sessionId: "s1",
      modality: "aba",
      systemPrompt: "Você é o Agente de Extração",
      diarioTexto: "Paciente realizou mando de bola independente",
      extracoesAprovadas: [
        {
          alvo: "mando-bola",
          nivel_ajuda: "independente",
          resultado: "acerto",
        },
      ],
    });

    expect(par.messages).toHaveLength(3);
    expect(par.messages[0]!.role).toBe("system");
    expect(par.messages[1]!.role).toBe("user");
    expect(par.messages[1]!.content).toContain("mando de bola");
    expect(par.messages[2]!.role).toBe("assistant");
    expect(par.messages[2]!.content).toContain("mando-bola");
  });

  it("constrói par DPO com resposta escolhida (humana) vs rejeitada (IA sem edição)", () => {
    const parDpo = construirParDpo({
      id: "dpo-1",
      patientId: "p1",
      sessionId: "s1",
      prompt:
        "Extrair evidências do diário: 'Tentou falar bola mas precisou de ajuda física'",
      chosen: JSON.stringify({
        nivel_ajuda: "dica_fisica",
        resultado: "acerto_apos_dica",
      }),
      rejected: JSON.stringify({
        nivel_ajuda: "independente",
        resultado: "acerto",
      }), // Erro da IA não corrigido
      motivoRejeicao:
        "IA atribuiu independente quando o relato citava ajuda física",
    });

    expect(parDpo.chosen).toContain("dica_fisica");
    expect(parDpo.rejected).toContain("independente");
    expect(parDpo.motivoRejeicao).toBeDefined();
  });

  it("exporta datasets em formatos padronizados (OpenAI Messages, ShareGPT, Alpaca e DPO JSONL)", () => {
    const parSft: SftTrainingPair = {
      id: "sft-1",
      patientId: "p1",
      sessionId: "s1",
      modality: "aba",
      messages: [
        { role: "system", content: "Sys" },
        { role: "user", content: "Diario" },
        { role: "assistant", content: "Extracao" },
      ],
      metadata: {
        confiancaMinima: 1,
        quantidadeExtracoes: 1,
        aprovadoPorTerapeuta: true,
      },
    };

    const parDpo: DpoTrainingPair = {
      id: "dpo-1",
      patientId: "p1",
      sessionId: "s1",
      prompt: "Prompt",
      chosen: "Chosen",
      rejected: "Rejected",
    };

    const jsonlOpenAi = exportarOpenAiMessagesJsonl([parSft]);
    expect(jsonlOpenAi).toContain('"messages":');
    expect(JSON.parse(jsonlOpenAi.trim())).toHaveProperty("messages");

    const jsonlShareGpt = exportarShareGptJsonl([parSft]);
    expect(jsonlShareGpt).toContain('"conversations":');
    expect(JSON.parse(jsonlShareGpt.trim())).toHaveProperty("conversations");

    const jsonlAlpaca = exportarAlpacaJsonl([parSft]);
    expect(jsonlAlpaca).toContain('"instruction":');
    expect(jsonlAlpaca).toContain('"output":');

    const jsonlDpo = exportarDpoJsonl([parDpo]);
    expect(jsonlDpo).toContain('"chosen":');
    expect(jsonlDpo).toContain('"rejected":');
  });
});
