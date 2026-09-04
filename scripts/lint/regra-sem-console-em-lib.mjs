/**
 * Guard da fatia F2 da #560 (`DA-04`): nenhum `console.*` cru em `src/lib/**`.
 *
 * Por que é uma regra e não uma revisão: a migração dos 31 sítios de `lib/`
 * para o logger estruturado é trabalho de UMA PR. O `console.*` volta na
 * próxima — é a chamada mais barata do JavaScript e ninguém escreve um teste
 * que fique vermelho porque um log saiu no formato errado. Sem enforcement, a
 * garantia que a F1 comprou (JSON, `requestId`, redaction por chave) dura até
 * o próximo `catch`.
 *
 * O que se perde num `console.warn("[tag]", { … })` cru, e é exatamente o que
 * a fatia existe para fechar:
 *
 * - **redaction por chave não roda.** `redigirContexto` mora no núcleo do
 *   logger (`registrar`), não no transporte. Um objeto solto no `console`
 *   passa ao lado dela — e foi assim que `err: e.message` (o SQL + os params
 *   do `DrizzleQueryError`, ou o corpo do gateway) saiu em 4 sítios medidos
 *   nesta varredura;
 * - **não há `requestId`.** Duas linhas da mesma request ficam sem como serem
 *   ligadas uma à outra no stdout do container;
 * - **o registro não é JSON.** O `grep` do operador precisa conhecer o
 *   formato de cada sítio.
 *
 * ## Por que regra própria em plugin inline, e não `no-restricted-syntax`
 *
 * O `eslint.config.mjs` já tem um bloco `no-restricted-syntax` — o guard de
 * PHI do `console.error` (#531, S-03) — cujo `files` cobre `src/app/**` **e**
 * `src/lib/**`. Em flat config as opções de uma MESMA regra **não se somam**
 * entre blocos: o último bloco que casa o arquivo vence. Um bloco novo com
 * `no-restricted-syntax` para `src/lib/**` APAGARIA aquele guard justamente
 * nos arquivos de lib — trocaria um guard por outro em silêncio, sem erro de
 * config. Por isso este arquivo segue o precedente da casa
 * (`ds/sem-paleta-crua`, `fronteira/sem-import-de-app`,
 * `rsc/use-client-obrigatorio`): regra própria, plugin próprio, namespace
 * próprio.
 *
 * Piso é ZERO, sem baseline: a varredura desta fatia fechou em zero.
 */

/**
 * O sink É o `console`. `sinkConsole` em `logger.ts` é a última linha antes da
 * saída do processo — proibir o `console` lá seria proibir o logger de
 * escrever. É a única exceção, e ela é nominal (um arquivo), não um padrão:
 * qualquer outro módulo que queira ser sink instala o seu por
 * `instalarSink`, e não escreve no `console` direto. `logger-node.ts` é a
 * prova: instala o transporte do `pino` e não toca no `console` — por isso
 * NÃO está aqui.
 */
export const ARQUIVOS_QUE_SAO_O_SINK = ["src/lib/observabilidade/logger.ts"];

const MENSAGEM =
  "[#560] `console.{{metodo}}` cru: o registro sai sem `requestId`, sem JSON e — o que importa — SEM a redaction por chave, que roda dentro de `registrar()` e não no transporte. Use `logger.{{sugestao}}(evento, contexto)` de `@/lib/observabilidade/logger`, com `evento` de conjunto fechado (`billing-reuso.cobranca-antiga-nao-reaproveitavel`), nunca frase interpolada. Se o que se loga é um erro, use `logarErroSemPII`/`logarAvisoSemPII` de `@/lib/observabilidade/logar-erro`: `err.message` do driver é o SQL + os params.";

/** `console.log`/`console.trace` não têm nível próprio: caem em `info`. */
const NIVEL_EQUIVALENTE = {
  log: "info",
  info: "info",
  debug: "debug",
  trace: "debug",
  warn: "warn",
  error: "error",
  dir: "debug",
  table: "debug",
};

/**
 * Nome do método chamado em `console.<x>()` ou `console["<x>"]()`, ou `null`
 * quando o `callee` não é um acesso a `console`.
 *
 * A forma computada (`console["warn"]`) entra de propósito: um guard que só
 * casa a forma com ponto ensina a contorná-lo com colchete, e o contorno fica
 * indistinguível de código legítimo na revisão.
 */
export function metodoDeConsole(callee) {
  if (callee?.type !== "MemberExpression") return null;
  if (
    callee.object?.type !== "Identifier" ||
    callee.object.name !== "console"
  ) {
    return null;
  }
  if (!callee.computed && callee.property?.type === "Identifier") {
    return callee.property.name;
  }
  if (
    callee.computed &&
    callee.property?.type === "Literal" &&
    typeof callee.property.value === "string"
  ) {
    return callee.property.value;
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const semConsoleCru = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Proíbe `console.*` cru em src/lib: o log da aplicação sai pelo logger estruturado (#560).",
    },
    schema: [],
    messages: { consoleCru: MENSAGEM },
  },
  create(context) {
    return {
      CallExpression(node) {
        const metodo = metodoDeConsole(node.callee);
        if (!metodo) return;
        context.report({
          node,
          messageId: "consoleCru",
          data: {
            metodo,
            sugestao: NIVEL_EQUIVALENTE[metodo] ?? "info",
          },
        });
      },
    };
  },
};

export const pluginObservabilidade = {
  meta: { name: "obs", version: "1.0.0" },
  rules: { "sem-console-cru": semConsoleCru },
};

/**
 * Escopo: `src/lib/**` (fatia F2) **e** `src/app/api/**` (fatia F3 — rotas de
 * API e jobs internos). Cada caminho só entra na lista DEPOIS que sua fatia
 * migrou: ligar o escopo antes produziria um baseline, e baseline é dívida
 * com data marcada. A varredura da F3 fechou em zero (4 sítios, todos em
 * `internal/jobs/asr-transcrever/route.ts`).
 *
 * Ainda fora, de propósito:
 *
 * - os 11 `logic.ts` de rota (`src/app/(app)/**`, `src/app/(auth)/**`) — são a
 *   F4, e são os arquivos que a #559 move. Entram lá;
 * - os componentes `"use client"` (`button.tsx`, `registrar-sw.tsx`, os dois
 *   de analytics) — ali o `console` é o canal do BROWSER, onde não há stdout
 *   de container para ler nem `requestId` de servidor a correlacionar. Se
 *   virarem escopo um dia, é por decisão própria, não de carona nesta lista.
 */
export const ESCOPO_SEM_CONSOLE = [
  "src/lib/**/*.{ts,tsx}",
  "src/app/api/**/*.{ts,tsx}",
];

/**
 * Teste e story ficam de fora — lá o `console` é instrumento de medida (é por
 * ele que se prova que a `message` NÃO saiu). Mesma fronteira das regras
 * vizinhas.
 */
export const FORA_DO_ESCOPO_SEM_CONSOLE = [
  "**/*.test.{ts,tsx}",
  "**/*.int.test.{ts,tsx}",
  "**/*.stories.{ts,tsx}",
  ...ARQUIVOS_QUE_SAO_O_SINK,
];
