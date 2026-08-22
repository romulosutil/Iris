/**
 * Guardrail de segurança contra injeção de scripts de preview em layouts e páginas (D53).
 *
 * Ferramentas de live preview / design assist (como Impeccable Live) podem injetar
 * tags de script apontando para localhost na porta 8400 ou marcadores de preview
 * durante sessões interativas de desenvolvimento de UI.
 *
 * Se essas injeções sobreviverem e forem commitadas:
 * 1. Em produção, os navegadores dos usuários farão requisições desnecessárias ou falhas
 *    de conexão para localhost na porta 8400 / scripts inexistentes.
 * 2. Em desenvolvimento / staging, criam acoplamento a portas locais e poluem o HTML base.
 * 3. Bypassam checagens de lint via diretivas como eslint-disable-next-line @next/next/no-sync-scripts.
 *
 * Este módulo fornece funções puras de análise estática para detectar e bloquear essas injeções.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface ViolacaoPreview {
  arquivo: string;
  linha: number;
  coluna?: number;
  conteudoLinha: string;
  padraoCorrespondente: string;
  motivo: string;
}

export interface RegraDetectorPreview {
  id: string;
  regex: RegExp;
  descricao: string;
}

/**
 * Regras de detecção de artefatos de preview e scripts locais indevidos.
 */
export const REGRAS_DETECCAO_PREVIEW: readonly RegraDetectorPreview[] = [
  {
    id: "marcador-impeccable-live",
    regex: new RegExp("impeccable" + "-live", "i"),
    descricao:
      "Marcador ou identificador de preview live (ex: marcadores start/end ou atributos de preview)",
  },
  {
    id: "url-porta-preview-8400",
    regex: /(?:localhost|127\.0\.0\.1):8400/i,
    descricao:
      "Referência à porta 8400 (porta padrão do servidor de preview / live reload)",
  },
  {
    id: "script-localhost",
    regex:
      /<script[^>]*\bsrc\s*=\s*["'][^"']*(?:localhost|127\.0\.0\.1)[^"']*["']/i,
    descricao:
      "Tag <script> apontando para host local (localhost ou 127.0.0.1)",
  },
  {
    id: "script-live-reload",
    regex: /<script[^>]*\bsrc\s*=\s*["'][^"']*\blive\.js["']/i,
    descricao: "Tag <script> carregando script de live reload (live.js)",
  },
] as const;

/**
 * Analisa o conteúdo de um arquivo de texto e retorna todas as violações encontradas.
 */
export function detectarScriptsPreview(
  conteudo: string,
  caminhoArquivo: string = "conteudo",
): ViolacaoPreview[] {
  const violacoes: ViolacaoPreview[] = [];
  const linhas = conteudo.split(/\r?\n/);

  for (let i = 0; i < linhas.length; i++) {
    const linhaTexto = linhas[i]!;
    const numeroLinha = i + 1;

    for (const regra of REGRAS_DETECCAO_PREVIEW) {
      if (regra.regex.test(linhaTexto)) {
        violacoes.push({
          arquivo: caminhoArquivo,
          linha: numeroLinha,
          conteudoLinha: linhaTexto.trim(),
          padraoCorrespondente: regra.id,
          motivo: regra.descricao,
        });
      }
    }
  }

  return violacoes;
}

/**
 * Lê e analisa um arquivo individual em disco contra scripts de preview.
 */
export function verificarArquivoContraScriptsPreview(
  caminhoArquivo: string,
): ViolacaoPreview[] {
  const conteudo = readFileSync(caminhoArquivo, "utf8");
  const caminhoNormalizado = path
    .relative(process.cwd(), caminhoArquivo)
    .replace(/\\/g, "/");
  return detectarScriptsPreview(conteudo, caminhoNormalizado);
}

export interface OpcoesVarreduraPreview {
  extensoes?: string[];
  ignorarTestes?: boolean;
  ignorarPastas?: string[];
  ignorarArquivos?: string[];
}

const EXTENSOES_PADRAO = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
];
const PASTAS_IGNORADAS_PADRAO = [
  "node_modules",
  ".next",
  ".git",
  ".impeccable",
  "dist",
  "build",
  ".turbo",
];
const ARQUIVOS_IGNORADOS_PADRAO = ["guardrail-preview-layout.ts"];

/**
 * Varre recursivamente um diretório procurando por arquivos com injeções de script de preview.
 */
export function verificarDiretorioContraScriptsPreview(
  diretorioRaiz: string,
  opcoes: OpcoesVarreduraPreview = {},
): ViolacaoPreview[] {
  const extensoes = opcoes.extensoes ?? EXTENSOES_PADRAO;
  const ignorarTestes = opcoes.ignorarTestes ?? true;
  const ignorarPastas = new Set(
    opcoes.ignorarPastas ?? PASTAS_IGNORADAS_PADRAO,
  );
  const ignorarArquivos = new Set(
    opcoes.ignorarArquivos ?? ARQUIVOS_IGNORADOS_PADRAO,
  );

  const violacoes: ViolacaoPreview[] = [];

  function visitar(dirAtual: string) {
    let entradas: string[];
    try {
      entradas = readdirSync(dirAtual);
    } catch {
      return;
    }

    for (const nome of entradas) {
      if (ignorarArquivos.has(nome)) {
        continue;
      }

      const caminhoCompleto = path.join(dirAtual, nome);
      let status;
      try {
        status = statSync(caminhoCompleto);
      } catch {
        continue;
      }

      if (status.isDirectory()) {
        if (!ignorarPastas.has(nome)) {
          visitar(caminhoCompleto);
        }
      } else if (status.isFile()) {
        const ext = path.extname(nome).toLowerCase();
        if (!extensoes.includes(ext)) {
          continue;
        }

        if (ignorarTestes && /(\.|\/)(test|spec|stories)\.[^.]+$/.test(nome)) {
          continue;
        }

        const violacoesArquivo =
          verificarArquivoContraScriptsPreview(caminhoCompleto);
        violacoes.push(...violacoesArquivo);
      }
    }
  }

  visitar(path.resolve(diretorioRaiz));
  return violacoes;
}
