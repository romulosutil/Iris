import type { DadosProntuarioExport } from "../export/pdf-generator";
import {
  sanitizarDocumentoClinico,
  criarMapeamentoAnonimizacao,
} from "./sanitizer";
import { segmentarDocumentoClinico, type ChunkerOptions } from "./chunker";
import type { EmbeddingProvider } from "./embedding";
import type { InMemoryVectorStore } from "./vector-store";
import type {
  ClinicalChunk,
  ClinicalDocument,
  ClinicalModality,
  ClinicalSectionType,
} from "./types";

export interface DadosExportComContexto extends DadosProntuarioExport {
  clinicId: string;
  modality?: ClinicalModality;
  disciplina?: string;
}

/**
 * Infere o tipo de seção a partir do título da seção exportada de forma resiliente a acentuação.
 */
export function inferirTipoSecao(titulo: string): ClinicalSectionType {
  const t = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (t.includes("plano terapeutico") || t.includes("pts")) {
    return "pts";
  }
  if (t.includes("responsavel tecnico") || t.includes("rt")) {
    return "responsavel_tecnico";
  }
  if (
    t.includes("evolucao") ||
    t.includes("evolucoes") ||
    t.includes("sessao") ||
    t.includes("sessoes")
  ) {
    return "evolucao_sessao";
  }
  if (
    t.includes("meta") ||
    t.includes("metas") ||
    t.includes("marco") ||
    t.includes("marcos")
  ) {
    return "marcos_metas";
  }
  if (
    t.includes("abc") ||
    t.includes("registro funcional") ||
    t.includes("comportamento")
  ) {
    return "registro_abc";
  }
  if (t.includes("capa") || t.includes("identificacao")) {
    return "capa_identificacao";
  }
  return "geral";
}

/**
 * Converte a estrutura de exportação do prontuário em um ClinicalDocument pronto para processamento RAG.
 */
export function converterExportParaClinicalDocument(
  dados: DadosExportComContexto,
): ClinicalDocument {
  const secoes = dados.secoes.map((s) => ({
    tipo: inferirTipoSecao(s.titulo),
    titulo: s.titulo,
    conteudo: s.conteudo,
  }));

  return {
    id: `prontuario-${dados.patientId}-${dados.timestampEmissao.getTime()}`,
    clinicId: dados.clinicId,
    patientId: dados.patientId,
    nomePacienteOriginal: dados.nomePaciente,
    cpfPacienteOriginal: dados.cpfSolicitante,
    timestamp: dados.timestampEmissao,
    modality: dados.modality,
    disciplina: dados.disciplina,
    secoes,
  };
}

/**
 * Executa o pipeline completo de ingestão:
 * 1. Conversão de formato de exportação para ClinicalDocument
 * 2. Sanitização LGPD (remoção de PII de pacientes/responsáveis/CPFs)
 * 3. Chunking semântico hierárquico com injeção de cabeçalhos contextuais
 * 4. Geração de embeddings e indexação no Vector Store multi-tenant
 */
export async function processarEIndexarDossieClinico(
  dados: DadosExportComContexto,
  store: InMemoryVectorStore,
  provider: EmbeddingProvider,
  chunkerOptions?: ChunkerOptions,
): Promise<{
  document: ClinicalDocument;
  chunks: ClinicalChunk[];
  totalChunksIndexados: number;
}> {
  // 1. Converter
  const docBruto = converterExportParaClinicalDocument(dados);

  // 2. Sanitizar LGPD com mapeamento de nomes de paciente e solicitante
  const mapping = criarMapeamentoAnonimizacao({
    nomePaciente: dados.nomePaciente,
    nomeResponsavel: dados.nomeSolicitante,
  });
  const docSanitizado = sanitizarDocumentoClinico(docBruto, mapping);

  // 3. Chunking
  const chunks = segmentarDocumentoClinico(docSanitizado, chunkerOptions);

  // 4. Indexação Vetorial
  await store.indexarChunks(chunks, provider);

  return {
    document: docSanitizado,
    chunks,
    totalChunksIndexados: chunks.length,
  };
}
