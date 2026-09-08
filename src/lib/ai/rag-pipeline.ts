/**
 * Pipeline de chunking + embedding do RAG de prontuários (D11 / #260, T3).
 *
 * O caminho é o do diagrama da issue, e a ordem dos passos é a garantia:
 *
 *   diário → [flag ligada?] → [PII sanitizada] → [assert fail-closed]
 *          → [chunking determinístico] → [embedding] → app_rag_indexar_chunk
 *
 * ## Onde cada guardrail é imposto (e por que ali)
 *
 * - **Consentimento de IA (guardrail 2)**: no BANCO, dentro de
 *   `app_rag_indexar_chunk` (migração `0158`). Não aqui. Uma verificação em TS
 *   é uma verificação que o próximo caminho de escrita esquece; no definer, o
 *   consentimento é condição de a linha existir — `app_role` não tem INSERT na
 *   tabela. Este módulo tem um pré-cheque opcional só para não gastar chamada
 *   paga de embedding num paciente que o banco vai recusar.
 * - **Anonimização (guardrail 3)**: aqui, ANTES do embedding, com
 *   `sanitizarPII`. Depois do embedding não desfaz nada — o vetor já é derivado
 *   do texto cru.
 * - **Rastreabilidade (guardrail 4)**: `session_note_id` + `sessao_em` são
 *   DERIVADOS da nota dentro do definer, nunca aceitos deste módulo.
 * - **Isolamento (guardrail 1)**: RLS + guard do definer. Este módulo chama
 *   sempre por dentro de `withTenant`.
 *
 * ## O provedor de embedding é uma PORTA, não uma dependência
 *
 * `EmbeddingProvider` é injetado. Motivo direto: a única implementação real
 * possível neste projeto é o Gemini (provedor único de IA), e cada chamada dele
 * é paga e sai da máquina. Uma porta permite que TODO o resto do pipeline
 * (sanitização, chunking, ordem, idempotência, fail-closed) seja exercitado por
 * teste sem gastar um centavo — e é o mesmo desenho de `AgentInvoker` em
 * `src/lib/extraction/llm-provider.ts`, que já é o padrão do repo.
 *
 * A implementação real (`@google/genai`, modelo lido de `RAG_EMBEDDING_MODEL`,
 * `outputDimensionality: 768` para casar com `vector(768)`) NÃO está neste PR —
 * ver a seção "O que ficou fora" da descrição.
 */
import "server-only";

import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { ragIndexacaoHabilitada } from "@/lib/flags";
import {
  contemPiiEstrutural,
  sanitizarPII,
  type IdentidadesDoPaciente,
} from "./pii-sanitizer";

/** Dimensão fixada pela coluna `vector(768)` da migração `0158`. */
export const DIMENSAO_EMBEDDING = 768;

/**
 * Janela de chunking. A issue pede "janela 500 tokens"; em pt-BR clínico a
 * razão observada é de ~4 caracteres por token, então 2000 caracteres é a
 * tradução. O número mora aqui, com o porquê, em vez de espalhado em literais.
 */
export const MAX_CHARS_CHUNK = 2000;

/**
 * Sobreposição entre chunks vizinhos. Existe porque a fronteira do chunk é
 * arbitrária em relação ao sentido: sem overlap, uma frase que descreve
 * antecedente num chunk e consequência no seguinte perde a relação nos dois
 * vetores. 200 caracteres ≈ uma a duas frases.
 */
export const OVERLAP_CHARS_CHUNK = 200;

/** Porta do provedor de embedding. Ver a nota do cabeçalho. */
export type EmbeddingProvider = {
  /** Identificador gravado em `patient_record_embeddings.modelo`. */
  readonly modelo: string;
  /** Um vetor por texto, na MESMA ordem da entrada. */
  gerar(textos: readonly string[]): Promise<number[][]>;
};

export type Chunk = {
  indice: number;
  texto: string;
};

/**
 * Quebra o texto em janelas com sobreposição, respeitando fronteira de
 * parágrafo e de frase — nesta ordem de preferência.
 *
 * Determinístico: mesma entrada, mesma saída. É requisito, não estética — o
 * `UNIQUE (session_note_id, chunk_indice, modelo)` da `0158` transforma
 * reindexação em UPSERT, e isso só é idempotente se o chunk de índice N for
 * sempre o mesmo pedaço de texto.
 *
 * Nunca corta no meio de uma palavra: um chunk que começa em "…comportam" é
 * ruído garantido no espaço vetorial.
 */
export function chunkarTexto(
  texto: string,
  opcoes: { maxChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const maxChars = opcoes.maxChars ?? MAX_CHARS_CHUNK;
  const overlap = Math.min(
    opcoes.overlapChars ?? OVERLAP_CHARS_CHUNK,
    maxChars - 1,
  );

  const limpo = texto.replace(/\r\n/g, "\n").trim();
  if (limpo.length === 0) return [];
  if (limpo.length <= maxChars) return [{ indice: 0, texto: limpo }];

  // Unidades atômicas: parágrafo, e dentro dele, frase. Uma unidade maior que a
  // janela é fatiada em pedaços de `maxChars` por fronteira de espaço.
  const unidades: string[] = [];
  for (const paragrafo of limpo.split(/\n{2,}/)) {
    const p = paragrafo.trim();
    if (p.length === 0) continue;
    if (p.length <= maxChars) {
      unidades.push(p);
      continue;
    }
    for (const frase of p.split(/(?<=[.!?…])\s+/)) {
      const f = frase.trim();
      if (f.length === 0) continue;
      if (f.length <= maxChars) {
        unidades.push(f);
        continue;
      }
      unidades.push(...fatiarPorEspaco(f, maxChars));
    }
  }

  const chunks: Chunk[] = [];
  let atual = "";
  const emitir = () => {
    const t = atual.trim();
    if (t.length > 0) chunks.push({ indice: chunks.length, texto: t });
  };

  for (const unidade of unidades) {
    const candidato = atual.length === 0 ? unidade : `${atual} ${unidade}`;
    if (candidato.length <= maxChars) {
      atual = candidato;
      continue;
    }
    emitir();
    // Cauda do chunk anterior como contexto do próximo, cortada em fronteira de
    // palavra. Se a cauda + a unidade nova já estourarem a janela, o overlap é
    // abandonado: manter a unidade inteira vale mais que manter o contexto.
    const cauda = caudaEmFronteiraDePalavra(atual, overlap);
    atual =
      cauda.length > 0 && cauda.length + 1 + unidade.length <= maxChars
        ? `${cauda} ${unidade}`
        : unidade;
  }
  emitir();

  return chunks;
}

function fatiarPorEspaco(texto: string, maxChars: number): string[] {
  const pedacos: string[] = [];
  let resto = texto;
  while (resto.length > maxChars) {
    const janela = resto.slice(0, maxChars);
    const corte = janela.lastIndexOf(" ");
    const fim = corte > maxChars / 2 ? corte : maxChars;
    pedacos.push(resto.slice(0, fim).trim());
    resto = resto.slice(fim).trim();
  }
  if (resto.length > 0) pedacos.push(resto);
  return pedacos;
}

function caudaEmFronteiraDePalavra(texto: string, overlap: number): string {
  if (overlap <= 0 || texto.length === 0) return "";
  const bruta = texto.slice(Math.max(0, texto.length - overlap));
  const espaco = bruta.indexOf(" ");
  return espaco === -1 ? bruta.trim() : bruta.slice(espaco + 1).trim();
}

export type ResultadoIndexacao =
  | { status: "desligado" }
  | { status: "vazio" }
  | { status: "indexado"; chunks: number; modelo: string };

export type EntradaIndexacao = {
  /** Nota a indexar. `patient_id`, `clinic_id` e `sessao_em` saem DELA no banco. */
  sessionNoteId: string;
  /** Texto CRU do diário. É sanitizado aqui — não passe texto já mastigado. */
  texto: string;
  /** Identidades para a allow-list do sanitizador (lidas de `patient`/`consent`). */
  identidades: IdentidadesDoPaciente;
};

/**
 * Indexa uma nota clínica. Idempotente por `(session_note_id, chunk_indice,
 * modelo)` — reprocessar a mesma nota reescreve as mesmas linhas.
 *
 * Não engole erro: se o definer recusar (tenant errado, consentimento ausente
 * ou revogado), a exceção do Postgres sobe. Um `catch` aqui transformaria
 * "recusado por LGPD" em "indexado com 0 chunks", que é o modo de falha que
 * `erro-renderizado-como-empty-state` descreve.
 */
export async function indexarNota(
  ctx: TenantContext,
  entrada: EntradaIndexacao,
  provider: EmbeddingProvider,
): Promise<ResultadoIndexacao> {
  if (!ragIndexacaoHabilitada()) return { status: "desligado" };

  const sanitizado = sanitizarPII(entrada.texto, entrada.identidades);

  // Fail-closed: o sanitizador é a primeira linha, este assert é a segunda.
  // Se sobrou CPF/e-mail/telefone com forma inequívoca, nada é enviado ao
  // provedor e nada é gravado — falhar alto é preferível a embeddar PII.
  if (contemPiiEstrutural(sanitizado.texto)) {
    throw new Error(
      "indexarNota: texto ainda contém PII estrutural após a sanitização — " +
        "indexação abortada (nenhum texto enviado ao provedor de embedding)",
    );
  }

  const chunks = chunkarTexto(sanitizado.texto);
  if (chunks.length === 0) return { status: "vazio" };

  const vetores = await provider.gerar(chunks.map((c) => c.texto));
  if (vetores.length !== chunks.length) {
    throw new Error(
      `indexarNota: provedor devolveu ${vetores.length} vetores para ${chunks.length} chunks`,
    );
  }
  for (const [i, vetor] of vetores.entries()) {
    if (vetor.length !== DIMENSAO_EMBEDDING) {
      throw new Error(
        `indexarNota: vetor ${i} tem ${vetor.length} dimensões; a coluna exige ${DIMENSAO_EMBEDDING}`,
      );
    }
  }

  await withTenant(ctx, async (tx) => {
    for (const [i, chunk] of chunks.entries()) {
      // Literal pgvector: `[a,b,c]`. O `::vector` é obrigatório — sem ele o
      // Postgres não escolhe a sobrecarga de `app_rag_indexar_chunk`.
      const literal = `[${vetores[i]!.join(",")}]`;
      await tx.execute(sql`SELECT app_rag_indexar_chunk(
        ${entrada.sessionNoteId}::uuid,
        ${chunk.indice},
        ${chunk.texto},
        ${literal}::vector,
        ${provider.modelo})`);
    }
  });

  return { status: "indexado", chunks: chunks.length, modelo: provider.modelo };
}
