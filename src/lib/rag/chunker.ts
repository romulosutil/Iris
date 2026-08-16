import type {
  ClinicalChunk,
  ClinicalDocument,
  ClinicalMetadata,
} from "./types";
import { estimarTokensTextoClinico } from "./tokenizer";

export interface ChunkerOptions {
  maxChunkTokens?: number; // Padrão: 384 tokens
  overlapTokens?: number; // Padrão: 48 tokens
}

/**
 * Segmenta um texto contínuo em janelas deslizantes respeitando sentenças e parágrafos.
 */
export function segmentarTextoEmJanelas(
  texto: string,
  options: { maxTokens: number; overlapTokens: number },
): string[] {
  if (!texto || texto.trim().length === 0) {
    return [];
  }

  const { maxTokens, overlapTokens } = options;
  const estimativaTotal = estimarTokensTextoClinico(texto);

  if (estimativaTotal <= maxTokens) {
    return [texto.trim()];
  }

  // Divide preferencialmente por parágrafos ou frases (. ! ?)
  const sentencas = texto
    .split(/(?<=[.!?\n])\s+/)
    .filter((s) => s.trim().length > 0);
  const janelas: string[] = [];

  let bufferAtual: string[] = [];
  let tokensAtual = 0;

  for (const sentenca of sentencas) {
    const tokensSentenca = estimarTokensTextoClinico(sentenca);

    if (tokensAtual + tokensSentenca > maxTokens && bufferAtual.length > 0) {
      janelas.push(bufferAtual.join(" "));

      // Calcular o buffer de overlap a manter
      let tokensMantidos = 0;
      const bufferOverlap: string[] = [];
      for (let i = bufferAtual.length - 1; i >= 0; i--) {
        const t = estimarTokensTextoClinico(bufferAtual[i]!);
        if (tokensMantidos + t <= overlapTokens) {
          bufferOverlap.unshift(bufferAtual[i]!);
          tokensMantidos += t;
        } else {
          break;
        }
      }

      bufferAtual = [...bufferOverlap, sentenca];
      tokensAtual = tokensMantidos + tokensSentenca;
    } else {
      bufferAtual.push(sentenca);
      tokensAtual += tokensSentenca;
    }
  }

  if (bufferAtual.length > 0) {
    janelas.push(bufferAtual.join(" "));
  }

  return janelas;
}

/**
 * Constrói a string de cabeçalho contextual de metadados padronizada.
 */
export function construirCabecalhoContextual(
  metadata: ClinicalMetadata,
): string {
  const partes: string[] = [
    `CLINICA=${metadata.clinicId}`,
    `PACIENTE=${metadata.patientId}`,
    `TIPO=${metadata.tipoSecao}`,
  ];

  if (metadata.dataSessao) {
    partes.push(`DATA=${metadata.dataSessao}`);
  }
  if (metadata.modality) {
    partes.push(`MODALIDADE=${metadata.modality}`);
  }
  if (metadata.dominios && metadata.dominios.length > 0) {
    partes.push(`DOMINIOS=${metadata.dominios.join(",")}`);
  }
  if (metadata.metas && metadata.metas.length > 0) {
    partes.push(`METAS=${metadata.metas.join(",")}`);
  }

  return `[METADADOS: ${partes.join(" | ")}]`;
}

/**
 * Segmenta um documento clínico (prontuário/dossiê exportado) em chunks semânticos ricos.
 */
export function segmentarDocumentoClinico(
  doc: ClinicalDocument,
  options: ChunkerOptions = {},
): ClinicalChunk[] {
  const maxChunkTokens = options.maxChunkTokens ?? 384;
  const overlapTokens = options.overlapTokens ?? 48;

  const chunks: ClinicalChunk[] = [];
  let chunkCounter = 1;

  for (const secao of doc.secoes) {
    const metadata: ClinicalMetadata = {
      clinicId: doc.clinicId,
      patientId: doc.patientId,
      tipoSecao: secao.tipo,
      dataSessao: secao.data,
      modality: doc.modality,
      disciplina: doc.disciplina,
      dominios: secao.dominios,
      metas: secao.metas,
    };

    const cabecalho = construirCabecalhoContextual(metadata);
    const textoCorpo = `${secao.titulo}\n${secao.conteudo}`;
    const janelas = segmentarTextoEmJanelas(textoCorpo, {
      maxTokens: maxChunkTokens,
      overlapTokens,
    });

    for (const janela of janelas) {
      const conteudoCompleto = `${cabecalho}\n${janela}`;
      const tokenCount = estimarTokensTextoClinico(conteudoCompleto);

      chunks.push({
        id: `${doc.id}-chunk-${chunkCounter++}`,
        conteudo: conteudoCompleto,
        conteudoOriginalSanitizado: janela,
        tokenCount,
        metadata,
        cabecalhoContextual: cabecalho,
      });
    }
  }

  return chunks;
}
