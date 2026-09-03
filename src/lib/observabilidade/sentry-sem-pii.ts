import { codigoPg } from "@/db/pg-error";

/**
 * `beforeSend` do Sentry/GlitchTip sem PII (#531, S-03).
 *
 * `error.tsx` e `onRequestError` mandam a exceção inteira ao GlitchTip. Para
 * um `DrizzleQueryError`/`PostgresError` a `message` carrega SQL + params —
 * no diário, a nota clínica. Aqui:
 * 1. erro de driver → `value` vira `Nome (SQLSTATE code)`; o code vem do
 *    `hint.originalException` (raiz ou `.cause`, via `codigoPg`);
 * 2. qualquer outra string do evento (message, values, breadcrumbs) perde o
 *    que vier depois de `params:`.
 *
 * Tipos estruturais de propósito: o módulo é testado sem importar o SDK e
 * serve para os três runtimes (server, edge, client).
 */
const NOMES_DE_DRIVER = new Set(["DrizzleQueryError", "PostgresError"]);

type ValorExcecao = { type?: string; value?: string };
type Breadcrumb = { message?: string };
export type EventoSentry = {
  message?: string;
  exception?: { values?: ValorExcecao[] };
  breadcrumbs?: Breadcrumb[];
  /** `Sentry.setExtra`/`extraErrorData`: chaves livres, valor qualquer. */
  extra?: Record<string, unknown>;
  /** `contexts.*` (os do SDK e os nossos): objetos aninhados. */
  contexts?: Record<string, unknown>;
};
export type HintSentry = { originalException?: unknown } | undefined;

/** Tudo após `params:` some — é onde o Drizzle cola os valores vinculados. */
export function semParams(texto: string): string {
  return texto.replace(/params:[\s\S]*$/, "params: [redigido]");
}

/**
 * `semParams` em profundidade: só strings mudam; objetos simples e arrays são
 * percorridos; o resto (número, boolean, null, Date, instância de classe)
 * fica como está. Limite de profundidade para não seguir referência circular.
 */
export function semParamsEmProfundidade(
  valor: unknown,
  profundidade = 0,
): unknown {
  if (typeof valor === "string") return semParams(valor);
  if (profundidade > 8 || valor === null || typeof valor !== "object") {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((v) => semParamsEmProfundidade(v, profundidade + 1));
  }
  if (Object.getPrototypeOf(valor) !== Object.prototype) return valor;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[k] = semParamsEmProfundidade(v, profundidade + 1);
  }
  return saida;
}

export function higienizarEventoSentry<E extends EventoSentry>(
  evento: E,
  hint: HintSentry,
): E {
  const codigo = codigoPg(hint?.originalException);
  const sufixo = codigo ? ` (SQLSTATE ${codigo})` : "";

  if (typeof evento.message === "string") {
    evento.message = semParams(evento.message);
  }
  for (const v of evento.exception?.values ?? []) {
    if (v.type && NOMES_DE_DRIVER.has(v.type)) {
      v.value = `${v.type}${sufixo}`;
    } else if (typeof v.value === "string") {
      v.value = semParams(v.value);
    }
  }
  for (const b of evento.breadcrumbs ?? []) {
    if (typeof b.message === "string") b.message = semParams(b.message);
  }
  // `extra` e `contexts` são onde `extraErrorData`/`setExtra` colariam o
  // objeto do erro inteiro (com `message`) — mesma tesoura, em profundidade.
  if (evento.extra) {
    evento.extra = semParamsEmProfundidade(evento.extra) as Record<
      string,
      unknown
    >;
  }
  if (evento.contexts) {
    evento.contexts = semParamsEmProfundidade(evento.contexts) as Record<
      string,
      unknown
    >;
  }
  return evento;
}
