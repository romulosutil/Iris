/**
 * Montador de ZIP e Manifesto SHA-256 (#374 ∪ #353, Task T3).
 *
 * Estrutura do bundle ZIP:
 *   manifest.json              Metadados, contagens e SHA-256 por arquivo
 *   README.txt                 Instruções em pt-BR de leitura e verificação
 *   dados/<tabela>.ndjson      Uma linha JSON por registro, ordenado por PK
 *   relatorios/<reportId>.pdf  PDFs congelados (sem re-render, sem IA)
 */
import { zipSync, strToU8 } from "fflate";
import { sha256Hex } from "@/lib/report/hash";
import type { ResultadoColeta } from "./coletor";

/** Teto de 250 MiB por bundle (D7). */
export const TETO_BUNDLE_BYTES = 250 * 1024 * 1024; // 262.144.000 bytes

export type ArquivoManifesto = {
  caminho: string;
  bytes: number;
  sha256: string;
};

export type ManifestExportacao = {
  versao: string;
  clinic: {
    id: string;
    nome: string;
  };
  gerado_em: string;
  solicitado_por: string;
  escopo: string;
  contagens_por_tabela: Record<string, number>;
  arquivos: ArquivoManifesto[];
};

export type ContextoBundle = {
  clinicId: string;
  clinicNome: string;
  solicitadoPorId: string;
  geradoEm?: Date;
  coleta: ResultadoColeta;
};

export type BundleMontado = {
  zipBuffer: Buffer;
  bytesTamanho: number;
  sha256: string;
  manifest: ManifestExportacao;
};

/**
 * Gera o texto explicativo do README.txt.
 */
function gerarReadme(clinicNome: string, geradoEmIso: string): string {
  return `================================================================================
ACERVO INTEGRAL DA CLÍNICA — EXPORTAÇÃO LGPD
================================================================================
Clínica: ${clinicNome}
Data de geração: ${geradoEmIso}
Âncora contratual: Termos de Uso §7.4 (b) | Âncora legal: LGPD Art. 18, V

ESTRUTURA DO ARQUIVO ZIP:
--------------------------------------------------------------------------------
1. manifest.json
   Manifesto estruturado com metadados da exportação, contagem de registros por
   tabela e checksum SHA-256 de cada arquivo individual.

2. dados/*.ndjson
   Arquivos no formato Newline Delimited JSON (NDJSON). Cada linha do arquivo
   representa um registro individual em formato JSON UTF-8, ordenado pela chave
   primária (PK).

3. relatorios/*.pdf
   Cópias congeladas dos relatórios clínicos gerados no prontuário da clínica.

COMO CONFERIR A INTEGRIDADE (SHA-256):
--------------------------------------------------------------------------------
No Linux/macOS:
  sha256sum -c <(jq -r '.arquivos[] | "\\(.sha256)  \\(.caminho)"' manifest.json)

No Windows (PowerShell):
  Get-FileHash dados/patient.ndjson -Algorithm SHA256

Em caso de dúvidas sobre este arquivo, contate o suporte da plataforma Iris.
================================================================================
`;
}

/**
 * Monta o arquivo ZIP em memória com validação de integridade SHA-256 e teto de 250 MiB.
 */
export function montarBundleZip(
  ctx: ContextoBundle,
  maxBytes: number = TETO_BUNDLE_BYTES,
): BundleMontado {
  const geradoEm = ctx.geradoEm ?? new Date();
  const geradoEmIso = geradoEm.toISOString();

  const arquivosNoZip: Record<string, Uint8Array> = {};
  const listaArquivosManifesto: ArquivoManifesto[] = [];

  // 1. README.txt
  const readmeTexto = gerarReadme(ctx.clinicNome, geradoEmIso);
  const readmeU8 = strToU8(readmeTexto);
  const readmeBuffer = Buffer.from(readmeU8);
  arquivosNoZip["README.txt"] = readmeU8;
  listaArquivosManifesto.push({
    caminho: "README.txt",
    bytes: readmeBuffer.length,
    sha256: sha256Hex(readmeBuffer),
  });

  // 2. dados/<tabela>.ndjson
  for (const item of ctx.coleta.tabelas) {
    const caminho = `dados/${item.tabela}.ndjson`;
    const u8 = strToU8(item.ndjson);
    const buf = Buffer.from(u8);
    arquivosNoZip[caminho] = u8;
    listaArquivosManifesto.push({
      caminho,
      bytes: buf.length,
      sha256: sha256Hex(buf),
    });
  }

  // 3. relatorios/<reportId>.pdf
  for (const pdf of ctx.coleta.pdfs) {
    const caminho = `relatorios/${pdf.reportId}.pdf`;
    const u8 = new Uint8Array(pdf.bytes);
    arquivosNoZip[caminho] = u8;
    listaArquivosManifesto.push({
      caminho,
      bytes: pdf.bytes.length,
      sha256: sha256Hex(pdf.bytes),
    });
  }

  // 4. manifest.json (montado com os hashes de todos os outros arquivos)
  const manifest: ManifestExportacao = {
    versao: "1.0",
    clinic: {
      id: ctx.clinicId,
      nome: ctx.clinicNome,
    },
    gerado_em: geradoEmIso,
    solicitado_por: ctx.solicitadoPorId,
    escopo: "integral",
    contagens_por_tabela: ctx.coleta.contagens,
    arquivos: listaArquivosManifesto,
  };

  const manifestJsonTexto = JSON.stringify(manifest, null, 2);
  const manifestU8 = strToU8(manifestJsonTexto);
  const manifestBuf = Buffer.from(manifestU8);
  arquivosNoZip["manifest.json"] = manifestU8;

  // 5. Compacta o ZIP (fflate)
  const zipU8 = zipSync(arquivosNoZip, { level: 6 });
  const zipBuffer = Buffer.from(zipU8);

  // 6. Verificação do teto de 250 MiB (D7)
  if (zipBuffer.length > maxBytes) {
    const err = new Error("bundle_excede_limite");
    err.name = "BundleExcedeLimiteError";
    throw err;
  }

  const sha256 = sha256Hex(zipBuffer);

  return {
    zipBuffer,
    bytesTamanho: zipBuffer.length,
    sha256,
    manifest,
  };
}
