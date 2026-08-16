import type {
  CanonicalHistoricoItem,
  ClinicalChunk,
  SearchResult,
  VectorFilter,
} from "./types";
import { similaridadeCosseno, type EmbeddingProvider } from "./embedding";
import { InMemoryVectorStore } from "./vector-store";

export interface HybridSearchInput {
  textoConsulta: string;
  filtro: VectorFilter;
  limite?: number;
  kRrf?: number;
}

/**
 * Calcula a pontuação RRF (Reciprocal Rank Fusion) para mesclar rankings.
 */
export function calcularRRF(
  rankDenso: number,
  rankEsparso: number,
  k: number = 60,
): number {
  const scoreDenso = rankDenso > 0 ? 1 / (k + rankDenso) : 0;
  const scoreEsparso = rankEsparso > 0 ? 1 / (k + rankEsparso) : 0;
  return scoreDenso + scoreEsparso;
}

/**
 * Tokenizador simples de termos léxicos em português para busca BM25/Esparsa.
 */
function extrairTermosConsulta(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos para busca flexível
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Calcula score léxico simples (BM25 simplificado) para um chunk contra termos de consulta.
 */
function calcularScoreLexico(chunk: ClinicalChunk, termos: string[]): number {
  if (termos.length === 0) return 0;

  const textoNormalizado = chunk.conteudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let score = 0;
  for (const termo of termos) {
    // Regex de correspondência de palavra inteira ou substring
    const regex = new RegExp(termo, "gi");
    const ocorrencias = (textoNormalizado.match(regex) || []).length;
    if (ocorrencias > 0) {
      score += 1 + Math.log(ocorrencias);
    }
  }

  return score;
}

export interface MmrOptions {
  chunks: ClinicalChunk[];
  vetores: number[][];
  vetorConsulta: number[];
  limite: number;
  lambda?: number; // 0.0 (máxima diversidade) a 1.0 (máxima relevância). Padrão: 0.7
}

/**
 * Aplica Maximal Marginal Relevance (MMR) para balancear relevância da query e diversidade de sessões.
 */
export function aplicarMMR(options: MmrOptions): ClinicalChunk[] {
  const { chunks, vetores, vetorConsulta, limite } = options;
  const lambda = options.lambda ?? 0.7;

  if (chunks.length <= limite) {
    return chunks;
  }

  const selecionadosIndices: number[] = [];
  const naoSelecionadosIndices = chunks.map((_, idx) => idx);

  // 1. Calcular similaridades de todos com a query
  const simQuery = vetores.map((v) => similaridadeCosseno(v, vetorConsulta));

  // 2. Selecionar iterativamente o melhor candidato segundo MMR
  while (
    selecionadosIndices.length < limite &&
    naoSelecionadosIndices.length > 0
  ) {
    let melhorScore = -Infinity;
    let melhorIdx = -1;
    let melhorPosicaoNaoSel = -1;

    for (let i = 0; i < naoSelecionadosIndices.length; i++) {
      const idxCandidato = naoSelecionadosIndices[i]!;
      const relQuery = simQuery[idxCandidato]!;

      let maxSimJaSelecionados = 0;
      for (const idxSel of selecionadosIndices) {
        const sim = similaridadeCosseno(
          vetores[idxCandidato]!,
          vetores[idxSel]!,
        );
        if (sim > maxSimJaSelecionados) {
          maxSimJaSelecionados = sim;
        }
      }

      const mmrScore = lambda * relQuery - (1 - lambda) * maxSimJaSelecionados;

      if (mmrScore > melhorScore) {
        melhorScore = mmrScore;
        melhorIdx = idxCandidato;
        melhorPosicaoNaoSel = i;
      }
    }

    if (melhorIdx !== -1) {
      selecionadosIndices.push(melhorIdx);
      naoSelecionadosIndices.splice(melhorPosicaoNaoSel, 1);
    } else {
      break;
    }
  }

  return selecionadosIndices.map((i) => chunks[i]!);
}

/**
 * Converte chunks clínicos recuperados no formato canônico de `historico_relevante`
 * consumido pelo Agente de Extração (Camada 1).
 */
export function projetarHistoricoRelevante(
  chunks: ClinicalChunk[],
): CanonicalHistoricoItem[] {
  return chunks.map((c) => {
    const dominio = c.metadata.dominios?.[0] ?? "geral";
    const protocol = c.metadata.protocoloFamilia ?? "vbmapp";
    return {
      dominio_id: dominio,
      protocol_id: protocol,
      resumo: c.conteudoOriginalSanitizado.trim(),
    };
  });
}

/**
 * Motor de Recuperação Híbrida (Dense Vector + Sparse BM25 + Fusão RRF).
 */
export class HybridClinicalRetriever {
  constructor(
    private vectorStore: InMemoryVectorStore,
    private embeddingProvider: EmbeddingProvider,
  ) {}

  async buscarHibrido(input: HybridSearchInput): Promise<SearchResult[]> {
    const limite = input.limite ?? 10;
    const kRrf = input.kRrf ?? 60;

    // 1. Busca Densa (Vetorial)
    const vetorConsulta = await this.embeddingProvider.gerarEmbedding(
      input.textoConsulta,
    );
    const resultadosDensos = await this.vectorStore.buscarVetores(
      vetorConsulta,
      input.filtro,
      limite * 2,
    );

    // 2. Busca Esparsa / Léxica
    const termos = extrairTermosConsulta(input.textoConsulta);
    // Varrer os chunks da clínica para score léxico
    // (Em produção com Postgres, o BM25 é executado via pg_trgm ou full-text search)
    const todosResultados = await this.vectorStore.buscarVetores(
      vetorConsulta,
      input.filtro,
      1000,
    );

    const resultadosEsparsos: SearchResult[] = todosResultados.map((item) => ({
      chunk: item.chunk,
      score: calcularScoreLexico(item.chunk, termos),
    }));

    // Ordenar decrescente léxico
    resultadosEsparsos.sort((a, b) => b.score - a.score);

    // 3. Mapear Rankings
    const mapRankDenso = new Map<string, number>();
    resultadosDensos.forEach((item, index) => {
      mapRankDenso.set(item.chunk.id, index + 1);
    });

    const mapRankEsparso = new Map<string, number>();
    resultadosEsparsos.forEach((item, index) => {
      if (item.score > 0) {
        mapRankEsparso.set(item.chunk.id, index + 1);
      }
    });

    // 4. Fusão RRF (Reciprocal Rank Fusion)
    const chunksUnicos = new Map<string, ClinicalChunk>();
    for (const r of resultadosDensos) {
      chunksUnicos.set(r.chunk.id, r.chunk);
    }
    for (const r of resultadosEsparsos) {
      if (r.score > 0) {
        chunksUnicos.set(r.chunk.id, r.chunk);
      }
    }

    const resultadosCombinados: SearchResult[] = [];

    for (const [id, chunk] of chunksUnicos.entries()) {
      const rankD = mapRankDenso.get(id) ?? 0;
      const rankE = mapRankEsparso.get(id) ?? 0;
      const rrf = calcularRRF(rankD, rankE, kRrf);

      resultadosCombinados.push({
        chunk,
        score: rrf,
        denseRank: rankD > 0 ? rankD : undefined,
        sparseRank: rankE > 0 ? rankE : undefined,
        rrfScore: rrf,
      });
    }

    // Ordenar decrescente por score RRF
    resultadosCombinados.sort((a, b) => b.score - a.score);

    return resultadosCombinados.slice(0, limite);
  }
}
