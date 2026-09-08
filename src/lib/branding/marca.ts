// #258 (D9) — Marca institucional (white-label) da clínica nos PDFs exportados.
//
// Módulo PURO: sem I/O, sem "server-only", sem DB. É importado pelo core
// server-only (`logic.ts` da tela), pelos dois renderizadores de PDF
// (pdfkit e HTML/Playwright) e pelo componente cliente de pré-visualização —
// por isso não pode carregar nada de servidor.
//
// O QUE ESTE ARQUIVO **NÃO** FAZ: ele não decide o que é inviolável. O selo de
// integridade Iris e a marca d'água nominal do solicitante são desenhados
// incondicionalmente pelos renderizadores; a marca da clínica só acrescenta
// cabeçalho e cor de acento. Ver `SELO_IRIS` abaixo.

/** Teto de upload do logotipo (regra 1 da #258). */
export const TAMANHO_MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Dimensões máximas do PNG. Não é estética: um PNG de 20000×20000 px cabe em
 * 2 MB (é altamente compressível) e estoura memória na decodificação do
 * pdfkit/Chromium — "decompression bomb". O teto é validado a partir do IHDR,
 * antes de qualquer decodificação.
 */
export const LARGURA_MAX_LOGO_PX = 4000;
export const ALTURA_MAX_LOGO_PX = 4000;

/**
 * SÓ PNG. SVG é markup executável (`<script>`, `<foreignObject>`, `<use
 * href="...">`) e sanitizá-lo com confiança exige um parser XML completo mais
 * uma allowlist mantida — superfície que esta feature não justifica. JPEG fica
 * de fora por outro motivo: logotipo institucional precisa de fundo
 * transparente, e o caminho de decisão "aceita JPEG?" traria mais um decodificador
 * para dentro do renderizador sem ganho. Decisão registrada no PR da #258.
 */
export const MIME_LOGO_ACEITO = "image/png";

/** Assinatura de 8 bytes do PNG (RFC 2083 §3.1). */
const ASSINATURA_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Selo de integridade da plataforma. INVIOLÁVEL: nenhum caminho de marca da
 * clínica o suprime, reescreve ou sobrepõe — é o que permite a um convênio ou
 * a um juiz distinguir um documento emitido pelo Iris de um PDF montado à mão
 * com o mesmo logotipo.
 *
 * POR QUE O HASH NÃO APARECE AQUI DENTRO: a issue #258 pede literalmente
 * `Gerado via Iris SaaS | Hash SHA-256: [hash]`. O hash é o SHA-256 do arquivo
 * PDF finalizado — escrevê-lo dentro do próprio arquivo é auto-referência
 * impossível (mudaria os bytes e, com eles, o hash). O valor real é calculado
 * depois do render (`gerarHashPdf` / `sha256Hex`) e gravado em `audit_log` e
 * em `report.pdf_hash`; o rodapé aponta para lá em vez de estampar um número
 * que não fecharia com o arquivo.
 */
export const SELO_IRIS =
  "Gerado via Iris SaaS | Hash SHA-256: registrado na trilha de auditoria";

/** Marca institucional já resolvida, pronta para ir a um renderizador. */
export type MarcaClinica = {
  /** Bytes do PNG validado, ou null quando a clínica não configurou logotipo. */
  logo: Buffer | null;
  /** MIME do logotipo — hoje sempre `image/png` quando `logo` não é null. */
  logoMime: string | null;
  /** Cor institucional `#RRGGBB` em minúsculas, ou null. */
  corPrimaria: string | null;
  /** Nome da clínica, usado no cabeçalho quando não há logotipo. */
  nomeClinica: string;
};

export type ResultadoValidacao<T> = { ok: true; valor: T } | { erro: string };

const HEX_COMPLETO = /^#?([0-9a-f]{6})$/i;
const HEX_CURTO = /^#?([0-9a-f]{3})$/i;

/** Normaliza `#ABC`, `abc123`, `#ABC123` → `#abc123`. */
export function normalizarCorHex(entrada: string): string | null {
  const bruto = entrada.trim();
  const curto = HEX_CURTO.exec(bruto);
  if (curto) {
    const [r, g, b] = curto[1]!.toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const completo = HEX_COMPLETO.exec(bruto);
  return completo ? `#${completo[1]!.toLowerCase()}` : null;
}

function canalLinear(canal8bits: number): number {
  const c = canal8bits / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa WCAG 2.1 (fórmula da definição de "relative luminance"). */
export function luminanciaRelativa(hex: string): number {
  const normalizada = normalizarCorHex(hex);
  if (!normalizada) throw new Error(`cor hexadecimal inválida: ${hex}`);
  const inteiro = parseInt(normalizada.slice(1), 16);
  const r = canalLinear((inteiro >> 16) & 0xff);
  const g = canalLinear((inteiro >> 8) & 0xff);
  const b = canalLinear(inteiro & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG 2.1 entre duas cores (1:1 a 21:1). */
export function razaoDeContraste(corA: string, corB: string): number {
  const a = luminanciaRelativa(corA);
  const b = luminanciaRelativa(corB);
  const claro = Math.max(a, b);
  const escuro = Math.min(a, b);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Fundo dos dois renderizadores de PDF: papel branco. */
export const FUNDO_PDF = "#ffffff";
/** Piso WCAG 2.1 AA para texto normal (regra 2 da #258). */
export const CONTRASTE_MINIMO_AA = 4.5;

/**
 * Valida a cor institucional no SERVIDOR (regra 2 da #258).
 *
 * A cor não é decorativa: ela pinta o nome da clínica e a régua do cabeçalho
 * sobre o papel branco do PDF. Um amarelo-claro passaria despercebido na tela
 * do coordenador (fundo escuro do seletor) e sumiria no documento impresso que
 * o convênio recebe. Por isso a régua é medida contra `#ffffff`, o fundo real
 * do documento, e não contra o fundo da UI onde a cor foi escolhida.
 */
export function validarCorMarca(
  entrada: string | null | undefined,
): ResultadoValidacao<string | null> {
  const bruto = (entrada ?? "").trim();
  if (bruto === "") return { ok: true, valor: null };

  const normalizada = normalizarCorHex(bruto);
  if (!normalizada) {
    return {
      erro: "Informe a cor no formato hexadecimal, por exemplo #1F4E79.",
    };
  }

  const contraste = razaoDeContraste(normalizada, FUNDO_PDF);
  if (contraste < CONTRASTE_MINIMO_AA) {
    return {
      erro: `A cor ${normalizada} tem contraste ${contraste.toFixed(2)}:1 sobre o fundo branco do PDF — abaixo do mínimo de ${CONTRASTE_MINIMO_AA}:1 (WCAG 2.1 AA). Escolha um tom mais escuro.`,
    };
  }

  return { ok: true, valor: normalizada };
}

export type DimensoesLogo = { largura: number; altura: number };

/**
 * Valida o logotipo por MAGIC BYTES, não pela extensão nem pelo `type` do
 * `File` — os dois vêm do cliente e são texto livre. A checagem lê a
 * assinatura de 8 bytes do PNG e o chunk IHDR (que, pela RFC 2083, é
 * obrigatoriamente o primeiro chunk) para extrair largura e altura.
 */
export function validarLogoPng(
  bytes: Buffer,
): ResultadoValidacao<DimensoesLogo> {
  if (bytes.length === 0) {
    return { erro: "O arquivo enviado está vazio." };
  }
  if (bytes.length > TAMANHO_MAX_LOGO_BYTES) {
    return {
      erro: `O logotipo tem ${(bytes.length / 1024 / 1024).toFixed(2)} MB e o limite é 2 MB.`,
    };
  }
  // 8 (assinatura) + 4 (tamanho do chunk) + 4 ("IHDR") + 8 (largura+altura).
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(ASSINATURA_PNG)) {
    return {
      erro: "O arquivo não é um PNG válido. Envie o logotipo em PNG (SVG não é aceito por segurança).",
    };
  }
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") {
    return {
      erro: "O arquivo não é um PNG válido. Envie o logotipo em PNG (SVG não é aceito por segurança).",
    };
  }

  const largura = bytes.readUInt32BE(16);
  const altura = bytes.readUInt32BE(20);
  if (largura === 0 || altura === 0) {
    return { erro: "O PNG enviado declara dimensão zero." };
  }
  if (largura > LARGURA_MAX_LOGO_PX || altura > ALTURA_MAX_LOGO_PX) {
    return {
      erro: `O logotipo tem ${largura}×${altura} px e o limite é ${LARGURA_MAX_LOGO_PX}×${ALTURA_MAX_LOGO_PX} px.`,
    };
  }

  return { ok: true, valor: { largura, altura } };
}

/** Data URI do logotipo — único formato que o sandbox de render aceita. */
export function logoComoDataUri(marca: MarcaClinica): string | null {
  if (!marca.logo || !marca.logoMime) return null;
  return `data:${marca.logoMime};base64,${marca.logo.toString("base64")}`;
}
