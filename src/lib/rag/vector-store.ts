import type {
  ClinicalChunk,
  EmbeddingVector,
  SearchResult,
  VectorFilter,
} from "./types";
import { similaridadeCosseno, type EmbeddingProvider } from "./embedding";

/**
 * Armazenamento Vetorial Multi-Tenant em Memória.
 * Implementa guardrails inegociáveis de isolamento por `clinicId` e compatibilidade com RLS.
 */
export class InMemoryVectorStore {
  // Mapa de clinicId -> Map<chunkId, EmbeddingVector>
  private tenantBuckets: Map<string, Map<string, EmbeddingVector>> = new Map();

  private validarClinicId(clinicId: string) {
    if (!clinicId || clinicId.trim().length === 0) {
      throw new Error(
        "Isolamento multi-tenant violado: clinicId é obrigatório em todas as operações vetoriais.",
      );
    }
  }

  private obterBucket(
    clinicId: string,
    criarSeNaoExistir = false,
  ): Map<string, EmbeddingVector> | undefined {
    this.validarClinicId(clinicId);
    if (!this.tenantBuckets.has(clinicId) && criarSeNaoExistir) {
      this.tenantBuckets.set(clinicId, new Map());
    }
    return this.tenantBuckets.get(clinicId);
  }

  /**
   * Insere um chunk e seu vetor de embedding associado.
   */
  async inserir(chunk: ClinicalChunk, vector: number[]): Promise<void> {
    const clinicId = chunk.metadata.clinicId;
    const bucket = this.obterBucket(clinicId, true)!;

    bucket.set(chunk.id, {
      id: chunk.id,
      vector,
      chunk,
    });
  }

  /**
   * Insere múltiplos chunks com seus respectivos vetores.
   */
  async inserirLote(
    itens: Array<{ chunk: ClinicalChunk; vector: number[] }>,
  ): Promise<void> {
    for (const item of itens) {
      await this.inserir(item.chunk, item.vector);
    }
  }

  /**
   * Insere um lote de chunks gerando os embeddings automaticamente através do provedor.
   */
  async indexarChunks(
    chunks: ClinicalChunk[],
    provider: EmbeddingProvider,
  ): Promise<void> {
    if (chunks.length === 0) return;

    const textos = chunks.map((c) => c.conteudo);
    const vetores = await provider.gerarEmbeddingsLote(textos);

    for (let i = 0; i < chunks.length; i++) {
      await this.inserir(chunks[i]!, vetores[i]!);
    }
  }

  /**
   * Executa busca por similaridade vetorial aplicando isolamento de tenant e filtros de metadados.
   */
  async buscarVetores(
    vetorConsulta: number[],
    filtro: VectorFilter,
    limite: number = 10,
  ): Promise<SearchResult[]> {
    this.validarClinicId(filtro.clinicId);
    const bucket = this.obterBucket(filtro.clinicId);

    if (!bucket || bucket.size === 0) {
      return [];
    }

    const resultados: SearchResult[] = [];

    for (const item of bucket.values()) {
      const meta = item.chunk.metadata;

      // Filtro de Paciente
      if (filtro.patientId && meta.patientId !== filtro.patientId) {
        continue;
      }

      // Filtro de Modalidade
      if (filtro.modality && meta.modality !== filtro.modality) {
        continue;
      }

      // Filtro de Disciplina
      if (filtro.disciplina && meta.disciplina !== filtro.disciplina) {
        continue;
      }

      // Filtro de Tipo de Seção
      if (filtro.tipoSecao && meta.tipoSecao !== filtro.tipoSecao) {
        continue;
      }

      // Filtro de Data Início
      if (
        filtro.dataInicio &&
        meta.dataSessao &&
        meta.dataSessao < filtro.dataInicio
      ) {
        continue;
      }

      // Filtro de Data Fim
      if (
        filtro.dataFim &&
        meta.dataSessao &&
        meta.dataSessao > filtro.dataFim
      ) {
        continue;
      }

      // Filtro de Domínios
      if (filtro.dominios && filtro.dominios.length > 0) {
        const domsChunk = meta.dominios ?? [];
        const matchDominio = filtro.dominios.some((d) => domsChunk.includes(d));
        if (!matchDominio) {
          continue;
        }
      }

      const score = similaridadeCosseno(vetorConsulta, item.vector);
      resultados.push({
        chunk: item.chunk,
        score,
      });
    }

    // Ordenar decrescente por similaridade
    resultados.sort((a, b) => b.score - a.score);

    return resultados.slice(0, limite);
  }

  /**
   * Remove todos os chunks de um paciente para cumprimento de expurgo / esquecimento LGPD.
   */
  async removerPorPaciente(
    clinicId: string,
    patientId: string,
  ): Promise<number> {
    this.validarClinicId(clinicId);
    const bucket = this.obterBucket(clinicId);
    if (!bucket) return 0;

    let removidos = 0;
    for (const [id, item] of bucket.entries()) {
      if (item.chunk.metadata.patientId === patientId) {
        bucket.delete(id);
        removidos++;
      }
    }

    return removidos;
  }

  /**
   * Retorna a quantidade de itens indexados para uma clínica.
   */
  async contar(filtro: {
    clinicId: string;
    patientId?: string;
  }): Promise<number> {
    this.validarClinicId(filtro.clinicId);
    const bucket = this.obterBucket(filtro.clinicId);
    if (!bucket) return 0;

    if (!filtro.patientId) {
      return bucket.size;
    }

    let count = 0;
    for (const item of bucket.values()) {
      if (item.chunk.metadata.patientId === filtro.patientId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Limpa todos os dados de uma clínica específica.
   */
  async limparClinica(clinicId: string): Promise<void> {
    this.validarClinicId(clinicId);
    this.tenantBuckets.delete(clinicId);
  }
}
