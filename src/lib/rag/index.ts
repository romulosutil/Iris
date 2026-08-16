/**
 * Módulo de Tokenização, RAG e Treinamento sobre Históricos Clínicos (D11 / Issue #120).
 * Ponto de entrada público unificado.
 */

// Tipos
export * from "./types";

// Sanitização LGPD
export {
  sanitizarTextoClinico,
  sanitizarDocumentoClinico,
  criarMapeamentoAnonimizacao,
  type AnonimizacaoMapping,
} from "./sanitizer";

// Tokenização & Orçamento de Contexto
export {
  estimarTokensTextoClinico,
  calcularOrcamentoContexto,
  truncarTextoPorTokens,
  type OrcamentoContextoInput,
  type OrcamentoContextoOutput,
} from "./tokenizer";

// Chunking Semântico & Hierárquico
export {
  segmentarDocumentoClinico,
  segmentarTextoEmJanelas,
  construirCabecalhoContextual,
  type ChunkerOptions,
} from "./chunker";

// Geometria Vetorial & Provedores de Embedding
export {
  normalizarVetor,
  similaridadeCosseno,
  produtoEscalar,
  DeterministicStubEmbeddingProvider,
  MockEmbeddingProvider,
  type EmbeddingProvider,
} from "./embedding";

// Vector Store Multi-tenant
export { InMemoryVectorStore } from "./vector-store";

// Retriever Híbrido, RRF, MMR & Projeção
export {
  HybridClinicalRetriever,
  calcularRRF,
  aplicarMMR,
  projetarHistoricoRelevante,
  type HybridSearchInput,
  type MmrOptions,
} from "./retriever";

// Pipeline de Treinamento & Formatação de Datasets
export {
  particionarDatasetAntiLeakage,
  construirParSft,
  construirParDpo,
  exportarOpenAiMessagesJsonl,
  exportarShareGptJsonl,
  exportarAlpacaJsonl,
  exportarDpoJsonl,
  type SplitOptions,
  type ConstruirParSftInput,
  type ConstruirParDpoInput,
} from "./training-pipeline";

// Ingestão & Carregamento de Dossiês Exportados
export {
  converterExportParaClinicalDocument,
  processarEIndexarDossieClinico,
  inferirTipoSecao,
  type DadosExportComContexto,
} from "./dossier-loader";
