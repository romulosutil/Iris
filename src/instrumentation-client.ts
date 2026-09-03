import * as Sentry from "@sentry/nextjs";
import { higienizarEventoSentry } from "@/lib/observabilidade/sentry-sem-pii";

/**
 * Observabilidade do browser → GlitchTip. No-op sem `NEXT_PUBLIC_SENTRY_DSN`.
 *
 * DSN público é embutido no bundle (por isso o prefixo NEXT_PUBLIC_); é o mesmo
 * conceito do DSN do Sentry — seguro de expor, só permite enviar eventos.
 * `sendDefaultPii: false` por LGPD (sem dado de menor em telemetria).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // #531 (S-03): mesmo filtro do servidor — `error.tsx` manda a exceção
    // inteira, e a `message` de erro de driver carrega SQL + params.
    beforeSend: (event, hint) => higienizarEventoSentry(event, hint),
  });
}

// Instrumenta navegação do App Router (Next 15+/16).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
