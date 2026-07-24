import * as Sentry from "@sentry/nextjs";

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
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Só erros por ora; sem tracing de performance (custo/ruído).
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Captura erros de renderização/requisição do App Router (Next 15+/16).
export const onRequestError = Sentry.captureRequestError;
