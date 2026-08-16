import crypto from "node:crypto";

export interface EmbeddingProvider {
  readonly dimensao: number;
  gerarEmbedding(texto: string): Promise<number[]>;
  gerarEmbeddingsLote(textos: string[]): Promise<number[][]>;
}

/**
 * Normaliza um vetor numérico para norma L2 unitária (|v| = 1).
 */
export function normalizarVetor(vetor: number[]): number[] {
  const normaQuadrada = vetor.reduce((sum, val) => sum + val * val, 0);
  const norma = Math.sqrt(normaQuadrada);

  if (norma === 0) {
    return vetor.map(() => 0);
  }

  return vetor.map((val) => val / norma);
}

/**
 * Calcula o produto escalar entre dois vetores de mesma dimensão.
 */
export function produtoEscalar(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error(
      `Dimensões incompatíveis no produto escalar: ${v1.length} vs ${v2.length}`,
    );
  }

  let produto = 0;
  for (let i = 0; i < v1.length; i++) {
    produto += v1[i]! * v2[i]!;
  }
  return produto;
}

/**
 * Calcula a similaridade de cosseno entre dois vetores.
 */
export function similaridadeCosseno(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error(
      `Dimensões incompatíveis no cálculo de cosseno: ${v1.length} vs ${v2.length}`,
    );
  }

  let dot = 0;
  let norma1 = 0;
  let norma2 = 0;

  for (let i = 0; i < v1.length; i++) {
    const a = v1[i]!;
    const b = v2[i]!;
    dot += a * b;
    norma1 += a * a;
    norma2 += b * b;
  }

  const denominador = Math.sqrt(norma1) * Math.sqrt(norma2);
  if (denominador === 0) return 0;

  return dot / denominador;
}

/**
 * Provedor de Embedding Determinístico (baseado em SHA-256 e PRNG de semente).
 * Ideal para testes unitários rápidos, pipelines CI/CD e ambientes offline sem dependência de rede.
 */
export class DeterministicStubEmbeddingProvider implements EmbeddingProvider {
  readonly dimensao: number;

  constructor(dimensao: number = 384) {
    this.dimensao = dimensao;
  }

  async gerarEmbedding(texto: string): Promise<number[]> {
    const hash = crypto.createHash("sha256").update(texto).digest();
    const vetor: number[] = [];

    // Gerador determinístico baseado no hash SHA-256 do texto
    for (let i = 0; i < this.dimensao; i++) {
      const byte1 = hash[i % hash.length]!;
      const byte2 = hash[(i + 7) % hash.length]!;
      const byte3 = hash[(i + 13) % hash.length]!;
      // Cria um valor float no intervalo [-1, 1]
      const val = ((byte1 ^ (byte2 << 1) ^ (byte3 << 2)) % 255) / 127.5 - 1.0;
      vetor.push(val);
    }

    return normalizarVetor(vetor);
  }

  async gerarEmbeddingsLote(textos: string[]): Promise<number[][]> {
    return Promise.all(textos.map((t) => this.gerarEmbedding(t)));
  }
}

/**
 * Provedor Mock para testes de cenários específicos de rankeamento e limiares de distância.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensao: number;
  private mapaPredefinido: Map<string, number[]> = new Map();

  constructor(dimensao: number = 3) {
    this.dimensao = dimensao;
  }

  definirEmbedding(texto: string, vetor: number[]) {
    if (vetor.length !== this.dimensao) {
      throw new Error(`Vetor deve ter dimensão ${this.dimensao}`);
    }
    this.mapaPredefinido.set(texto, normalizarVetor(vetor));
  }

  async gerarEmbedding(texto: string): Promise<number[]> {
    if (this.mapaPredefinido.has(texto)) {
      return this.mapaPredefinido.get(texto)!;
    }
    // Fallback: vetor de zeros com primeiro elemento 1.0
    const fallback = new Array(this.dimensao).fill(0);
    fallback[0] = 1.0;
    return fallback;
  }

  async gerarEmbeddingsLote(textos: string[]): Promise<number[][]> {
    return Promise.all(textos.map((t) => this.gerarEmbedding(t)));
  }
}
