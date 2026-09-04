/**
 * Log estruturado dos jobs de infra (#560, fatia F3b) — **sem dependência**.
 *
 * ## Por que não é o logger de `src/lib/observabilidade`
 *
 * As imagens de infra (`infra/<serviço>/Dockerfile`) copiam scripts À MÃO e
 * não instalam pacote nenhum. `infra/billing/Dockerfile` diz isso com todas as
 * letras — "SEM `npm install`: NENHUMA dependência, de propósito" — porque foi
 * uma imagem com deps listadas à mão que derrubou o motor de escalonamento em
 * produção com CI verde (#156, memória `imagem-escalonamento-nao-herda-app`).
 * Importar `pino` aqui, ou importar `src/lib/**` (que nem é copiado para a
 * imagem), reabriria exatamente essa classe de falha.
 *
 * Então este módulo é Node puro: só `node:crypto`, que é builtin e portanto
 * nunca falta. A FORMA do registro é a mesma do logger da app — mesmo nome de
 * campo, mesma redaction por chave — para que o operador leia os dois do mesmo
 * jeito e um agregador futuro não precise de dois parsers.
 *
 * ## O que muda em relação ao logger da app
 *
 * - **`execucaoId` no lugar de `requestId`.** Não existe request num job; o que
 *   correlaciona linhas é a RODADA. Um id por processo liga todas as linhas de
 *   uma passada, inclusive as que saem depois de um `await`.
 * - **Sem sink plugável.** Um job não tem teste que precise interceptar o
 *   transporte dentro da imagem; a captura, quando existe, é do lado do teste
 *   em `.test.mjs`, lendo o que foi escrito.
 *
 * ## A lista de PII é ESPELHO, não cópia livre
 *
 * `CHAVES_PII`/`PADROES_PII` abaixo repetem `src/lib/observabilidade/redacao.ts`
 * porque não há como importar TypeScript de dentro da imagem. Duas listas que
 * podem divergir seriam o defeito, não a solução — por isso
 * `scripts/lib/log-estruturado.paridade.test.ts` (roda no `pnpm test`) importa
 * as DUAS e falha se elas deixarem de coincidir. Adicionar chave em um lado sem
 * o outro fica vermelho no CI, não em produção.
 */

import { createHash, randomUUID } from "node:crypto";

/** Igual a `redacao.ts`: `trecho_fonte`, `trechoFonte` e `trecho-fonte` colidem. */
export function normalizarChave(chave) {
  return chave.toLowerCase().replace(/[-_\s]/g, "");
}

export const VALOR_REDIGIDO = "[redigido]";

/** Espelho de `CHAVES_PII` (`src/lib/observabilidade/redacao.ts`). */
export const CHAVES_PII = [
  "nome",
  "cpf",
  "email",
  "nascimento",
  "telefone",
  "celular",
  "responsavelcontato",
  "texto",
  "observacoes",
  "descricao",
  "justificativa",
  "motivo",
  "motivodescarte",
  "diagnostico",
  "queixa",
  "trechofonte",
  "producaoliteral",
  "resumosessao",
  "contexto",
  "antecedente",
  "comportamento",
  "evidencia",
  "justificativaconfianca",
  "message",
  "mensagem",
  "stack",
  "params",
];

const CONJUNTO_PII = new Set(CHAVES_PII);

/** Espelho de `PADROES_PII`. Mesmas famílias, mesma ordem, mesmo raciocínio. */
const PADROES_PII = [
  (k) => k.includes("cpf"),
  (k) =>
    k.includes("senha") ||
    k.includes("password") ||
    k.includes("secret") ||
    k.includes("apikey"),
  (k) => k.endsWith("token") || k.endsWith("tokenhash"),
  (k) => k.endsWith("texto"),
  (k) => k.startsWith("endereco"),
];

export function chaveEhPII(chave) {
  const normalizada = normalizarChave(chave);
  if (CONJUNTO_PII.has(normalizada)) return true;
  return PADROES_PII.some((casa) => casa(normalizada));
}

const PROFUNDIDADE_MAXIMA = 8;

/**
 * Mesmas regras da app: chave proibida vira `[redigido]` inteira; objeto
 * simples e array são percorridos; instância de classe (um `Error`, uma `Date`)
 * NÃO é percorrida — vira o nome da classe, senão `message`/`stack` voltariam
 * por uma chave que não está na lista.
 */
export function redigirContexto(valor, profundidade = 0) {
  if (profundidade > PROFUNDIDADE_MAXIMA) return "[profundo]";
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) {
    return valor.map((item) => redigirContexto(item, profundidade + 1));
  }
  const prototipo = Object.getPrototypeOf(valor);
  if (prototipo !== Object.prototype && prototipo !== null) {
    return valor.constructor?.name ?? "object";
  }
  const saida = {};
  for (const [chave, item] of Object.entries(valor)) {
    saida[chave] = chaveEhPII(chave)
      ? VALOR_REDIGIDO
      : redigirContexto(item, profundidade + 1);
  }
  return saida;
}

/**
 * Id da RODADA. Gerado uma vez por processo: um job é uma passada, e o que
 * correlaciona as linhas dele é ter sido a mesma passada.
 *
 * Aceita `LOG_EXECUCAO_ID` do ambiente para o caso em que o agendador já tem um
 * id (uma execução manual que o operador quer rastrear); sem ele, sorteia.
 */
export const execucaoId =
  process.env.LOG_EXECUCAO_ID || randomUUID().slice(0, 8);

const ORDEM = { debug: 10, info: 20, warn: 30, error: 40 };

function nivelMinimo() {
  const bruto = (process.env.LOG_NIVEL || "info").toLowerCase();
  return bruto in ORDEM ? bruto : "info";
}

/**
 * `bigint` e afins não passam pelo `JSON.stringify` nativo — o driver devolve
 * `bytes_tamanho` assim. Um log que LANÇA ao tentar registrar é pior que um log
 * ausente: derruba o job pelo caminho da instrumentação.
 */
export function substituirNaoSerializavel(_chave, valor) {
  if (typeof valor === "bigint") return `${valor}`;
  if (typeof valor === "function") return "[funcao]";
  if (typeof valor === "undefined") return null;
  return valor;
}

/**
 * Reduz qualquer valor lançado ao conjunto fechado — espelho de `resumirErro`.
 *
 * Nunca a `message`: num `DrizzleQueryError`/`PostgresError` ela é a query com
 * os params, e nestes jobs um desses params é a nota clínica. O que sai é
 * classe, `code`, `constraint` e um HASH da mensagem — que serve para
 * reconhecer "é o mesmo erro de antes" sem carregar o conteúdo.
 *
 * A `cause` entra porque os jobs embrulham o erro do driver
 * (`new Error("falha no lote 3", { cause })`) — o `code` que interessa está lá,
 * como `detalheDoErro` do heartbeat já reconhecia.
 */
export function resumirErro(err) {
  const alvo =
    err && typeof err === "object" && err.cause && typeof err.cause === "object"
      ? err.cause
      : err;
  const resumo = { erroNome: nomeDe(err) };
  if (alvo !== err) resumo.causaNome = nomeDe(alvo);
  const codigo = alvo?.code ?? err?.code;
  if (typeof codigo === "string" || typeof codigo === "number") {
    resumo.codigo = String(codigo);
  }
  const constraint = alvo?.constraint_name ?? alvo?.constraint;
  if (typeof constraint === "string" && constraint) {
    resumo.constraint = constraint;
  }
  const http = alvo?.status ?? alvo?.statusCode;
  if (typeof http === "number") resumo.httpStatus = http;
  const mensagem = mensagemDe(err);
  if (mensagem !== undefined) resumo.hashMensagem = hashCurto(mensagem);
  return resumo;
}

function nomeDe(valor) {
  if (valor instanceof Error) return valor.name || "Error";
  if (valor && typeof valor === "object") {
    return typeof valor.name === "string" && valor.name ? valor.name : "object";
  }
  return typeof valor;
}

function mensagemDe(valor) {
  if (valor instanceof Error) return valor.message;
  if (valor && typeof valor === "object") {
    return typeof valor.message === "string" ? valor.message : undefined;
  }
  return typeof valor === "string" ? valor : undefined;
}

/**
 * 8 hex de sha256 — só para correlacionar mensagens iguais.
 *
 * `node:crypto` é builtin: não adiciona dependência à imagem. Do lado da app o
 * mesmo hash é sha256 escrito à mão, porque lá o módulo roda no browser e no
 * runtime edge, onde `node:crypto` não existe. Aqui não existe esse problema —
 * e por isso os dois NÃO precisam produzir o mesmo dígito: o hash serve para
 * dizer "é o mesmo erro de antes" dentro de um mesmo fluxo de log, não para
 * casar um registro de job com um registro de request.
 */
export function hashCurto(texto) {
  return createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 8);
}

/**
 * Escreve um registro. `evento` é de conjunto fechado
 * (`expurgo.lote-concluido`), NUNCA frase interpolada: é por ele que se filtra,
 * e uma frase com número dentro é um evento diferente por execução.
 */
export function registrar(nivel, evento, contexto) {
  if (ORDEM[nivel] < ORDEM[nivelMinimo()]) return execucaoId;
  const registro = {
    ...(contexto ? redigirContexto(contexto) : {}),
    nivel,
    evento,
    execucaoId,
    hora: new Date().toISOString(),
  };
  const linha = JSON.stringify(registro, substituirNaoSerializavel);
  // `error`/`warn` para stderr, o resto para stdout — é o que separa o que o
  // operador precisa ver do que ele só consulta.
  const destino = nivel === "error" || nivel === "warn" ? "stderr" : "stdout";
  process[destino].write(`${linha}\n`);
  return execucaoId;
}

/** Fachada — a forma que os jobs usam. */
export const log = {
  debug: (evento, contexto) => registrar("debug", evento, contexto),
  info: (evento, contexto) => registrar("info", evento, contexto),
  warn: (evento, contexto) => registrar("warn", evento, contexto),
  error: (evento, contexto) => registrar("error", evento, contexto),
};

/**
 * Substitui `console.error(rotulo, err)` — e, mais importante, substitui
 * `console.error(err)`, que era o formato de 5 dos sítios desta fatia e
 * imprimia `message` + `stack` inteiros no painel do Easypanel (servido em
 * HTTP puro, memória `easypanel-ambiente-expoe-segredos`).
 */
export function logarErro(evento, err, extra) {
  return registrar("error", evento, { ...resumirErro(err), ...(extra ?? {}) });
}

/** Mesmo resumo, em `warn` — para falha que degrada e não interrompe o job. */
export function logarAviso(evento, err, extra) {
  return registrar("warn", evento, { ...resumirErro(err), ...(extra ?? {}) });
}
