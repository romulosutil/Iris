/**
 * Tipos canônicos para o Pipeline de Tokenização, RAG e Treinamento (D11 / Issue #120).
 * Garante tipagem estrita para isolamento multi-tenant, sanitização LGPD e interoperabilidade.
 */

export type ClinicalModality =
  "aba" | "fonoaudiologia" | "terapia_ocupacional" | "tcc" | "conventional";

export type ClinicalSectionType =
  | "capa_identificacao"
  | "pts"
  | "responsavel_tecnico"
  | "evolucao_sessao"
  | "marcos_metas"
  | "registro_abc"
  | "geral";

export interface ClinicalMetadata {
  clinicId: string;
  patientId: string;
  sessionId?: string;
  dataSessao?: string; // YYYY-MM-DD
  modality?: ClinicalModality;
  disciplina?: string;
  profissionalId?: string;
  tipoSecao: ClinicalSectionType;
  dominios?: string[];
  metas?: string[];
  protocoloFamilia?: string;
}

export interface ClinicalChunk {
  id: string;
  conteudo: string;
  conteudoOriginalSanitizado: string;
  tokenCount: number;
  metadata: ClinicalMetadata;
  cabecalhoContextual: string;
}

export interface ClinicalDocument {
  id: string;
  clinicId: string;
  patientId: string;
  nomePacienteOriginal?: string;
  cpfPacienteOriginal?: string;
  timestamp: Date;
  modality?: ClinicalModality;
  disciplina?: string;
  secoes: Array<{
    tipo: ClinicalSectionType;
    titulo: string;
    conteudo: string;
    data?: string;
    dominios?: string[];
    metas?: string[];
    profissional?: string;
  }>;
}

export interface EmbeddingVector {
  id: string;
  vector: number[];
  chunk: ClinicalChunk;
}

export interface VectorFilter {
  clinicId: string; // OBRIGATÓRIO: Guardrail inegociável de isolamento multi-tenant
  patientId?: string;
  modality?: ClinicalModality;
  disciplina?: string;
  tipoSecao?: ClinicalSectionType;
  dataInicio?: string;
  dataFim?: string;
  dominios?: string[];
}

export interface SearchResult {
  chunk: ClinicalChunk;
  score: number;
  denseRank?: number;
  sparseRank?: number;
  rrfScore?: number;
}

export interface CanonicalHistoricoItem {
  dominio_id: string;
  protocol_id: string;
  resumo: string;
}

export interface SftTrainingMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SftTrainingPair {
  id: string;
  patientId: string;
  sessionId: string;
  modality: string;
  messages: SftTrainingMessage[];
  metadata: {
    confiancaMinima: number;
    quantidadeExtracoes: number;
    aprovadoPorTerapeuta: boolean;
  };
}

export interface DpoTrainingPair {
  id: string;
  patientId: string;
  sessionId: string;
  prompt: string;
  chosen: string;
  rejected: string;
  motivoRejeicao?: string;
}

export interface DatasetSplit<T> {
  train: T[];
  validation: T[];
  test: T[];
  estatisticas: {
    totalItens: number;
    totalPacientes: number;
    pacientesTreino: number;
    pacientesVal: number;
    pacientesTeste: number;
  };
}
