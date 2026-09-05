import * as Sentry from "@sentry/nextjs";
import { higienizarEventoSentry } from "@/lib/observabilidade/sentry-sem-pii";

/**
 * Observabilidade server/edge → GlitchTip (self-host, SDK compatível com Sentry).
 *
 * Tudo é **no-op sem `SENTRY_DSN`**: em dev e em qualquer ambiente sem a env, não
 * inicializa nada nem muda comportamento (build fica verde sem config). O DSN só
 * é preenchido nos secrets do Easypanel depois que o projeto for criado no painel
 * do GlitchTip.
 *
 * LGPD: `sendDefaultPii: false` — não anexa IP/headers/cookies do usuário. O
 * GlitchTip roda no mesmo VPS (São Paulo), então o dado de erro não sai do país.
 */
export async function register(): Promise<void> {
  // #560 (F1): liga o transporte `pino` e o escopo de correlação por request.
  // Só no runtime Node — `pino` e `node:async_hooks` não existem no edge, e o
  // núcleo do logger (`logger.ts`) já funciona lá com o sink de `console`.
  //
  // O `import` é dinâmico porque `instrumentation.ts` é avaliado nos dois
  // runtimes; a falha NÃO é engolida. Imagem sem `pino` (a dos jobs internos
  // não herda as dependências do app) precisa quebrar aqui e ser vista, não
  // degradar em silêncio para o `console`.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { instalarLoggerNode } =
      await import("@/lib/observabilidade/logger-node");
    instalarLoggerNode();
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Só erros por ora; sem tracing de performance (custo/ruído).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // #531 (S-03): a `message` de `DrizzleQueryError`/`PostgresError` carrega
    // SQL + params (a nota clínica). Vira `Nome (SQLSTATE code)` e qualquer
    // string do evento perde o que vem depois de `params:`.
    beforeSend: (event, hint) => higienizarEventoSentry(event, hint),
  });
}

// Captura erros de renderização/requisição do App Router (Next 15+/16).
export const onRequestError = Sentry.captureRequestError;
