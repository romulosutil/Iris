import { AsyncLocalStorage } from "node:async_hooks";
import { pino } from "pino";

import {
  instalarResolvedorRequestId,
  instalarSink,
  type RegistroLog,
} from "./logger";
import { caminhosPinoRedact, VALOR_REDIGIDO } from "./redacao";

/**
 * Transporte Node do logger estruturado (#560, F1).
 *
 * Isolado do núcleo porque `pino` e `node:async_hooks` não existem no runtime
 * edge (onde o `proxy.ts` roda) nem no browser (onde três componentes
 * `"use client"` importam `logar-erro.ts`). Só `instrumentation.ts` importa
 * este módulo, e só sob `NEXT_RUNTIME === "nodejs"`.
 *
 * Nada aqui é a garantia de redaction — essa já rodou em `registrar`, no
 * núcleo. O `redact` do `pino` abaixo é a segunda camada: se um dia alguém
 * chamar o sink por fora do núcleo, as chaves continuam censuradas.
 */

const armazenamento = new AsyncLocalStorage<string>();

/**
 * Executa `fn` com o id de correlação em escopo: todo `registrar` disparado
 * dentro dela — inclusive depois de um `await` — sai com este `requestId`.
 *
 * O escopo é por chamada, não módulo-global: uma variável de módulo seria
 * lida pela request errada sob concorrência, que é o normal num servidor.
 */
export function executarComRequestId<T>(requestId: string, fn: () => T): T {
  return armazenamento.run(requestId, fn);
}

/** O id do escopo em curso, ou `undefined` fora de uma request. */
export function requestIdDoEscopo(): string | undefined {
  return armazenamento.getStore();
}

const instancia = pino({
  level: "trace", // O corte por nível já aconteceu em `registrar`.
  base: undefined, // Sem `pid`/`hostname`: ruído por linha, sem uso aqui.
  timestamp: false, // `hora` já vem no registro, em ISO.
  messageKey: "evento",
  redact: {
    paths: caminhosPinoRedact(),
    censor: VALOR_REDIGIDO,
  },
});

const NIVEL_PINO = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
} as const;

function sinkPino(registro: RegistroLog): void {
  const { nivel, evento, ...resto } = registro;
  instancia[NIVEL_PINO[nivel]]({ ...resto, evento });
}

/**
 * Liga o transporte e o escopo de correlação. Idempotente.
 *
 * Chamado por `instrumentation.ts`. Se `pino` faltar na imagem, o import
 * deste módulo lança — de propósito. A alternativa (`await import` engolido
 * num `catch`) degrada em silêncio: a imagem sobe verde e ninguém descobre
 * que o transporte sumiu. Quem chama decide o que fazer com a exceção, mas
 * ela precisa existir.
 */
export function instalarLoggerNode(): void {
  instalarSink(sinkPino);
  instalarResolvedorRequestId(requestIdDoEscopo);
}
