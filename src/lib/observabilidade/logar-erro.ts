import { codigoPg, constraintPg } from "@/db/pg-error";
import { gerarCorrelacaoId, registrar } from "./logger";

/**
 * Log de erro sem PII (#531, achado S-03 da auditoria 360).
 *
 * Por que existe: `drizzle-orm@0.45` monta a `.message` do `DrizzleQueryError`
 * como `"Failed query: <sql>\nparams: <params>"` — e `params` são os VALORES
 * vinculados. Numa escrita do diário, isso é a nota clínica inteira. Um
 * `console.error("acao:", err)` imprime `message` + `stack` no stdout do
 * container, lido pelo painel do Easypanel em HTTP puro (memória
 * `easypanel-ambiente-expoe-segredos`). O mesmo vale para o erro do driver em
 * `.cause`: numa violação de constraint o Postgres ecoa o valor da linha.
 *
 * O que ENTRA no log (conjunto fechado — não existe caminho de dado da
 * `message` para a saída, então não há como vazar por acidente):
 * - `nome`      — classe do erro (`DrizzleQueryError`, `TypeError`, …);
 * - `codigo`    — SQLSTATE / `code` (raiz ou `.cause`, via `codigoPg`);
 * - `constraint` — nome da constraint violada, quando o Postgres informa;
 * - `causaNome` — classe do erro em `.cause`;
 * - `hashMensagem` — sha256 (8 hex) da `message`, só para correlacionar
 *   ocorrências iguais entre si (não é reversível);
 * - `correlacaoId` — id curto, único por chamada, que a UI mostra ao usuário
 *   ("código X") e o operador procura no log.
 *
 * O que NUNCA entra: `message`, `stack`, o objeto do erro, `params`.
 *
 * `extra` é responsabilidade do CHAMADOR. O helper garante que só primitivos
 * passam (objeto é descartado em runtime), mas não inspeciona o conteúdo de
 * uma string: um e-mail, um CPF ou o corpo serializado de um gateway
 * entrariam como estão. Regra: `extra` leva identificadores opacos (ids,
 * contagens, códigos de conjunto fechado como `errors[].code`), nunca texto
 * livre nem corpo de terceiro — reduza antes de passar.
 *
 * Sem `server-only` de propósito: componentes client também logam erro de
 * `fetch`/action, e o helper não depende de nada de Node (o sha256 é puro JS
 * porque `node:crypto` não existe no browser e `crypto.subtle` é assíncrono).
 */

/** Só primitivos: um objeto poderia carregar a `message` de carona. */
export type ExtraLog = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ResumoErro = {
  correlacaoId: string;
  nome: string;
  codigo?: string;
  constraint?: string;
  causaNome?: string;
  /** Status HTTP do gateway/SDK (`BillingProviderError`, `APIError`): número fechado, nunca texto. */
  httpStatus?: number;
  hashMensagem?: string;
};

function nomeDe(valor: unknown): string {
  if (valor instanceof Error) return valor.name || "Error";
  if (valor && typeof valor === "object") {
    // Erros de SDK que não estendem `Error` (ex.: `{ name, message }` do
    // Resend) — o `name` é categoria fechada do provedor, não texto livre.
    const nome = (valor as { name?: unknown }).name;
    if (typeof nome === "string" && nome) return nome;
    return "object";
  }
  return typeof valor;
}

function mensagemDe(valor: unknown): string | undefined {
  if (valor instanceof Error) return valor.message;
  if (valor && typeof valor === "object") {
    const m = (valor as { message?: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return typeof valor === "string" ? valor : undefined;
}

/**
 * Id curto por chamada — o que o usuário vê e o operador procura no log.
 *
 * A implementação passou para `./logger` (#560, F1), onde mora a correlação;
 * o nome continua exportado daqui porque é a superfície pública que os
 * chamadores já usam.
 */
export { gerarCorrelacaoId };

/** Reduz qualquer valor lançado ao conjunto fechado de campos sem PII. */
export function resumirErro(
  err: unknown,
  correlacaoId: string = gerarCorrelacaoId(),
): ResumoErro {
  const resumo: ResumoErro = { correlacaoId, nome: nomeDe(err) };
  const codigo = codigoPg(err);
  if (typeof codigo === "string" && codigo) resumo.codigo = codigo;
  else if (typeof codigo === "number") resumo.codigo = String(codigo);
  const constraint = constraintPg(err);
  if (constraint) resumo.constraint = constraint;
  const comStatus = err as
    { status?: unknown; statusCode?: unknown } | null | undefined;
  const http = comStatus?.status ?? comStatus?.statusCode;
  if (typeof http === "number") resumo.httpStatus = http;
  const causa = (err as { cause?: unknown } | null | undefined)?.cause;
  if (causa !== undefined && causa !== null) resumo.causaNome = nomeDe(causa);
  const mensagem = mensagemDe(err);
  if (mensagem !== undefined) resumo.hashMensagem = hashCurto(mensagem);
  return resumo;
}

/**
 * Uma linha, para quando o destino é uma string (resposta de job interno,
 * coluna de diagnóstico no banco): `DrizzleQueryError (SQLSTATE 23505,
 * constraint uq_x) correlacao=abcd1234`. Nunca a `message`.
 */
export function descreverErroSemPII(
  err: unknown,
  correlacaoId: string = gerarCorrelacaoId(),
): string {
  const r = resumirErro(err, correlacaoId);
  const detalhes: string[] = [];
  if (r.codigo) detalhes.push(`SQLSTATE ${r.codigo}`);
  if (r.constraint) detalhes.push(`constraint ${r.constraint}`);
  if (r.httpStatus !== undefined) detalhes.push(`HTTP ${r.httpStatus}`);
  const cabeca = detalhes.length
    ? `${r.nome} (${detalhes.join(", ")})`
    : r.nome;
  return `${cabeca} correlacao=${r.correlacaoId}`;
}

type Nivel = "error" | "warn";

function emitir(
  nivel: Nivel,
  rotulo: string,
  err: unknown,
  extra?: ExtraLog,
): string {
  const resumo = resumirErro(err);
  // `nome` do resumo é a CLASSE do erro; `nome` no domínio é o nome do
  // paciente. Colisão descoberta ao ligar a redaction por chave (#560): manter
  // a classe sob `nome` obrigaria a lista a liberar `nome`, e aí
  // `extra: { nome: paciente.nome }` sairia inteiro. O registro usa `erroNome`;
  // `ResumoErro.nome` (API pública de `resumirErro`) não mudou.
  const { nome, ...restoDoResumo } = resumo;
  const seguro: Record<string, string | number | boolean | null | undefined> = {
    ...restoDoResumo,
    erroNome: nome,
  };
  if (extra) {
    for (const [chave, valor] of Object.entries(extra)) {
      // Fronteira em runtime, não só no tipo: `as any` no chamador não pode
      // reabrir o caminho para a `message`.
      if (
        valor === null ||
        valor === undefined ||
        typeof valor === "string" ||
        typeof valor === "number" ||
        typeof valor === "boolean"
      ) {
        seguro[chave] = valor;
      }
    }
  }
  // #560 (F1): caminho único de saída. Antes eram `console.warn`/`console.error`
  // com um objeto solto; agora o registro sai como JSON, com `requestId`, e
  // passa pela redaction por chave. A assinatura pública não mudou — é por
  // isso que os 49 chamadores continuam compilando sem uma linha alterada.
  registrar(nivel, rotulo, seguro);
  return resumo.correlacaoId;
}

/**
 * Substitui `console.error(rotulo, err)`. Devolve o `correlacaoId` para o
 * chamador colocar na mensagem ao usuário (`textoErroInterno` em
 * `@/lib/copy/erros`).
 */
export function logarErroSemPII(
  rotulo: string,
  err: unknown,
  extra?: ExtraLog,
): string {
  return emitir("error", rotulo, err, extra);
}

/**
 * Mesmo resumo, em nível `warn` — para falha que degrada (uma faixa
 * informativa que não carregou) e não quebra o fluxo. O nível é sinal para
 * quem lê o log; o conteúdo obedece à mesma regra: nunca a `message`.
 */
export function logarAvisoSemPII(
  rotulo: string,
  err: unknown,
  extra?: ExtraLog,
): string {
  return emitir("warn", rotulo, err, extra);
}

// ─── sha256 puro (8 hex) ─────────────────────────────────────────────────────
// Só para correlacionar mensagens iguais; a implementação é a de FIPS 180-4
// sem dependência de runtime (roda em Node, edge e browser).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(texto: string): string {
  const dados = new TextEncoder().encode(texto);
  const tamanho = dados.length;
  const bitsBaixo = (tamanho * 8) >>> 0;
  const bitsAlto = Math.floor((tamanho * 8) / 0x100000000);
  // Múltiplo de 64 com espaço para 0x80 + 8 bytes de comprimento.
  const total = (((tamanho + 8) >> 6) + 1) << 6;
  const bloco = new Uint8Array(total);
  bloco.set(dados);
  bloco[tamanho] = 0x80;
  const vista = new DataView(bloco.buffer);
  vista.setUint32(total - 8, bitsAlto);
  vista.setUint32(total - 4, bitsBaixo);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let inicio = 0; inicio < total; inicio += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(inicio + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 =
        rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h[0]!,
      b = h[1]!,
      c = h[2]!,
      d = h[3]!,
      e = h[4]!,
      f = h[5]!,
      g = h[6]!,
      hh = h[7]!;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  let hex = "";
  for (const palavra of h) hex += palavra.toString(16).padStart(8, "0");
  return hex;
}

/** sha256 truncado a 8 hex — correlação, não segredo. */
export function hashCurto(texto: string): string {
  return sha256Hex(texto).slice(0, 8);
}
