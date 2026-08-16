import crypto from "node:crypto";
import type { DatasetSplit, DpoTrainingPair, SftTrainingPair } from "./types";

export interface SplitOptions {
  proporcaoTreino?: number; // Padrão: 0.80 (80%)
  proporcaoVal?: number; // Padrão: 0.10 (10%)
  proporcaoTeste?: number; // Padrão: 0.10 (10%)
}

/**
 * Calcula um hash determinístico de 0 a 99 para um patientId.
 */
function hashPatientId(patientId: string): number {
  const hash = crypto.createHash("md5").update(patientId).digest("hex");
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 100;
}

/**
 * Particiona um conjunto de dados de treino com garantia estrita de Zero Data Leakage por Paciente.
 * Todas as sessões de um dado paciente são direcionadas deterministicamente para o mesmo split.
 */
export function particionarDatasetAntiLeakage<T extends { patientId: string }>(
  itens: T[],
  options: SplitOptions = {},
): DatasetSplit<T> {
  const propTreino = options.proporcaoTreino ?? 0.8;
  const propVal = options.proporcaoVal ?? 0.1;

  const corteTreino = Math.round(propTreino * 100);
  const corteVal = Math.round((propTreino + propVal) * 100);

  const train: T[] = [];
  const validation: T[] = [];
  const test: T[] = [];

  const pacientesTreinoSet = new Set<string>();
  const pacientesValSet = new Set<string>();
  const pacientesTesteSet = new Set<string>();
  const todosPacientesSet = new Set<string>();

  for (const item of itens) {
    todosPacientesSet.add(item.patientId);
    const bucket = hashPatientId(item.patientId);

    if (bucket < corteTreino) {
      train.push(item);
      pacientesTreinoSet.add(item.patientId);
    } else if (bucket < corteVal) {
      validation.push(item);
      pacientesValSet.add(item.patientId);
    } else {
      test.push(item);
      pacientesTesteSet.add(item.patientId);
    }
  }

  return {
    train,
    validation,
    test,
    estatisticas: {
      totalItens: itens.length,
      totalPacientes: todosPacientesSet.size,
      pacientesTreino: pacientesTreinoSet.size,
      pacientesVal: pacientesValSet.size,
      pacientesTeste: pacientesTesteSet.size,
    },
  };
}

export interface ConstruirParSftInput {
  id: string;
  patientId: string;
  sessionId: string;
  modality: string;
  systemPrompt: string;
  diarioTexto: string;
  contextoJson?: Record<string, unknown>;
  extracoesAprovadas: unknown;
  confiancaMinima?: number;
}

/**
 * Constrói um par SFT padronizado a partir do relato clínico e das extrações aprovadas pelo terapeuta.
 */
export function construirParSft(input: ConstruirParSftInput): SftTrainingPair {
  let promptUsuario = input.diarioTexto;
  if (input.contextoJson) {
    promptUsuario = `CONTEXTO DO PACIENTE:\n${JSON.stringify(input.contextoJson, null, 2)}\n\nDIÁRIO DA SESSÃO:\n${input.diarioTexto}`;
  }

  return {
    id: input.id,
    patientId: input.patientId,
    sessionId: input.sessionId,
    modality: input.modality,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: promptUsuario },
      {
        role: "assistant",
        content:
          typeof input.extracoesAprovadas === "string"
            ? input.extracoesAprovadas
            : JSON.stringify(input.extracoesAprovadas, null, 2),
      },
    ],
    metadata: {
      confiancaMinima: input.confiancaMinima ?? 1.0,
      quantidadeExtracoes: Array.isArray(input.extracoesAprovadas)
        ? input.extracoesAprovadas.length
        : 1,
      aprovadoPorTerapeuta: true,
    },
  };
}

export interface ConstruirParDpoInput {
  id: string;
  patientId: string;
  sessionId: string;
  prompt: string;
  chosen: string;
  rejected: string;
  motivoRejeicao?: string;
}

/**
 * Constrói um par DPO (Direct Preference Optimization) contrastando a extração aprovada vs a rejeitada.
 */
export function construirParDpo(input: ConstruirParDpoInput): DpoTrainingPair {
  return {
    id: input.id,
    patientId: input.patientId,
    sessionId: input.sessionId,
    prompt: input.prompt,
    chosen: input.chosen,
    rejected: input.rejected,
    motivoRejeicao: input.motivoRejeicao,
  };
}

/**
 * Exporta pares SFT no formato OpenAI Chat Messages JSONL:
 * `{"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}`
 */
export function exportarOpenAiMessagesJsonl(pares: SftTrainingPair[]): string {
  return (
    pares
      .map((p) =>
        JSON.stringify({
          messages: p.messages,
        }),
      )
      .join("\n") + "\n"
  );
}

/**
 * Exporta pares SFT no formato ShareGPT JSONL:
 * `{"conversations": [{"from": "human", "value": ...}, {"from": "gpt", "value": ...}]}`
 */
export function exportarShareGptJsonl(pares: SftTrainingPair[]): string {
  return (
    pares
      .map((p) => {
        const conversations = p.messages.map((m) => {
          let from = "human";
          if (m.role === "system") from = "system";
          else if (m.role === "assistant") from = "gpt";
          return { from, value: m.content };
        });
        return JSON.stringify({ id: p.id, conversations });
      })
      .join("\n") + "\n"
  );
}

/**
 * Exporta pares SFT no formato Alpaca JSONL:
 * `{"instruction": ..., "input": ..., "output": ...}`
 */
export function exportarAlpacaJsonl(pares: SftTrainingPair[]): string {
  return (
    pares
      .map((p) => {
        const sysMsg =
          p.messages.find((m) => m.role === "system")?.content ?? "";
        const userMsg =
          p.messages.find((m) => m.role === "user")?.content ?? "";
        const assistantMsg =
          p.messages.find((m) => m.role === "assistant")?.content ?? "";

        return JSON.stringify({
          instruction: sysMsg,
          input: userMsg,
          output: assistantMsg,
        });
      })
      .join("\n") + "\n"
  );
}

/**
 * Exporta pares DPO no formato padrão JSONL:
 * `{"prompt": ..., "chosen": ..., "rejected": ...}`
 */
export function exportarDpoJsonl(pares: DpoTrainingPair[]): string {
  return (
    pares
      .map((p) =>
        JSON.stringify({
          id: p.id,
          prompt: p.prompt,
          chosen: p.chosen,
          rejected: p.rejected,
          motivo: p.motivoRejeicao,
        }),
      )
      .join("\n") + "\n"
  );
}
