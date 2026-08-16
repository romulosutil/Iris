import type { ClinicalDocument } from "./types";

export interface AnonimizacaoMapping {
  pacienteTokens?: string[];
  responsavelTokens?: string[];
  profissionalTokens?: string[];
  customReplacements?: Array<{ search: string; replaceWith: string }>;
}

export function criarMapeamentoAnonimizacao(nomes: {
  nomePaciente?: string;
  nomeResponsavel?: string;
  nomeProfissional?: string;
}): AnonimizacaoMapping {
  const mapping: AnonimizacaoMapping = {
    pacienteTokens: [],
    responsavelTokens: [],
    profissionalTokens: [],
    customReplacements: [],
  };

  if (nomes.nomePaciente) {
    const nomeCompleto = nomes.nomePaciente.trim();
    if (nomeCompleto.length > 0) {
      mapping.pacienteTokens?.push(nomeCompleto);
    }
  }

  if (nomes.nomeResponsavel) {
    const nomeCompleto = nomes.nomeResponsavel.trim();
    if (nomeCompleto.length > 0) {
      mapping.responsavelTokens?.push(nomeCompleto);
    }
  }

  if (nomes.nomeProfissional) {
    const nomeCompleto = nomes.nomeProfissional.trim();
    if (nomeCompleto.length > 0) {
      mapping.profissionalTokens?.push(nomeCompleto);
    }
  }

  return mapping;
}

const REGEX_CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const REGEX_CPF_NUMERICO = /\b(?:\d{11})\b/g;
const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const REGEX_TELEFONE_BR =
  /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})\b/g;

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Higieniza texto clínico removendo PII (CPFs, e-mails, telefones, nomes de pacientes/responsáveis)
 * em conformidade com as diretrizes da LGPD (Art. 13 e 18).
 */
export function sanitizarTextoClinico(
  texto: string,
  mapping?: AnonimizacaoMapping,
): string {
  if (!texto) return "";

  let resultado = texto;

  // 1. Substituir mapeamentos explícitos de nomes
  if (mapping) {
    if (mapping.pacienteTokens) {
      for (const token of mapping.pacienteTokens) {
        if (token.length >= 2) {
          const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
          resultado = resultado.replace(regex, "[PACIENTE]");
        }
      }
    }

    if (mapping.responsavelTokens) {
      for (const token of mapping.responsavelTokens) {
        if (token.length >= 2) {
          const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
          resultado = resultado.replace(regex, "[RESPONSAVEL]");
        }
      }
    }

    if (mapping.profissionalTokens) {
      for (const token of mapping.profissionalTokens) {
        if (token.length >= 2) {
          const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
          resultado = resultado.replace(regex, "[PROFISSIONAL]");
        }
      }
    }

    if (mapping.customReplacements) {
      for (const item of mapping.customReplacements) {
        const regex = new RegExp(escapeRegExp(item.search), "gi");
        resultado = resultado.replace(regex, item.replaceWith);
      }
    }
  }

  // 2. Remoção de CPFs
  resultado = resultado.replace(REGEX_CPF_FORMATADO, "[CPF_REMOVIDO]");
  resultado = resultado.replace(REGEX_CPF_NUMERICO, "[CPF_REMOVIDO]");

  // 3. Remoção de E-mails
  resultado = resultado.replace(REGEX_EMAIL, "[EMAIL_REMOVIDO]");

  // 4. Remoção de Telefones
  resultado = resultado.replace(REGEX_TELEFONE_BR, "[TELEFONE_REMOVIDO]");

  return resultado;
}

/**
 * Sanitiza um documento clínico completo mantendo metadados clínicos e removendo PII.
 */
export function sanitizarDocumentoClinico(
  doc: ClinicalDocument,
  customMapping?: AnonimizacaoMapping,
): ClinicalDocument {
  const mapping =
    customMapping ??
    criarMapeamentoAnonimizacao({
      nomePaciente: doc.nomePacienteOriginal,
    });

  const secoesSanitizadas = doc.secoes.map((s) => ({
    ...s,
    conteudo: sanitizarTextoClinico(s.conteudo, mapping),
  }));

  return {
    ...doc,
    nomePacienteOriginal: undefined,
    cpfPacienteOriginal: undefined,
    secoes: secoesSanitizadas,
  };
}
