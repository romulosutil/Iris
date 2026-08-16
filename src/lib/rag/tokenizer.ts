/**
 * Módulo de Tokenização Clínica e Gestão de Orçamento de Contexto.
 * Otimizado para o vocabulário técnico e morfologia do português brasileiro (pt-BR).
 */

const FATOR_EXPANSAO_PT_BR = 1.35;

/**
 * Estima a quantidade de tokens BPE de um texto clínico em Português.
 */
export function estimarTokensTextoClinico(texto: string): number {
  if (!texto || texto.trim().length === 0) {
    return 0;
  }

  // Dividir por whitespace para obter palavras
  const palavras = texto.trim().split(/\s+/);
  let totalTokens = 0;

  for (const palavra of palavras) {
    if (palavra.length <= 3) {
      totalTokens += 1;
    } else if (palavra.length <= 7) {
      totalTokens += 1.3;
    } else if (palavra.length <= 12) {
      totalTokens += 2.0;
    } else {
      totalTokens += Math.ceil(palavra.length / 4);
    }

    // Caracteres especiais ou pontuações agregam tokens adicionais
    const pontuacoes = (palavra.match(/[,.;:!?"'()[\]{}_+\-=<>/\\]/g) || [])
      .length;
    totalTokens += pontuacoes * 0.5;
  }

  return Math.ceil(totalTokens);
}

export interface OrcamentoContextoInput {
  limiteTotal: number;
  tokensSistema: number;
  tokensSessaoAtual: number;
  margemSeguranca?: number;
}

export interface OrcamentoContextoOutput {
  limiteTotal: number;
  tokensFixos: number;
  tokensDisponiveisRag: number;
  margemSeguranca: number;
}

/**
 * Calcula a fatia de tokens disponível para injeção de contexto RAG sem estourar o teto do modelo.
 */
export function calcularOrcamentoContexto(
  input: OrcamentoContextoInput,
): OrcamentoContextoOutput {
  const margem = input.margemSeguranca ?? 256;
  const tokensFixos = input.tokensSistema + input.tokensSessaoAtual;
  const tokensDisponiveis = Math.max(
    0,
    input.limiteTotal - tokensFixos - margem,
  );

  return {
    limiteTotal: input.limiteTotal,
    tokensFixos,
    tokensDisponiveisRag: tokensDisponiveis,
    margemSeguranca: margem,
  };
}

/**
 * Trunca um texto em português respeitando um limite aproximado de tokens.
 */
export function truncarTextoPorTokens(
  texto: string,
  maxTokens: number,
): string {
  if (!texto) return "";
  if (maxTokens <= 0) return "";

  const estimativa = estimarTokensTextoClinico(texto);
  if (estimativa <= maxTokens) {
    return texto;
  }

  const palavras = texto.trim().split(/\s+/);
  const palavrasResultado: string[] = [];
  let contagemAtual = 0;

  for (const palavra of palavras) {
    const tokensPalavra = estimarTokensTextoClinico(palavra);
    if (contagemAtual + tokensPalavra > maxTokens) {
      break;
    }
    palavrasResultado.push(palavra);
    contagemAtual += tokensPalavra;
  }

  return palavrasResultado.join(" ") + "...";
}
