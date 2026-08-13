"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import "@/styles/globals.css";
import { fontVariables } from "@/app/fonts";
import { Button } from "@/components/ui/button";
import { PaginaErro } from "@/components/ui/pagina-erro";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Página 500 global (Next.js global-error.tsx). Captura falhas no root
 * layout e o SUBSTITUI — por isso define as próprias tags <html>/<body> e
 * reimporta globals.css. Fontes e atributos do <html> vêm de `@/app/fonts`
 * e espelham o layout.tsx por construção.
 *
 * Sem instrumentação automática aqui (o layout que registraria já caiu):
 * captureException explícito é o único caminho do erro até o GlitchTip.
 * Mesmo guardrail do error.tsx: nada de stack/SQL no HTML ou no console.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR" data-mode="clinico" className={fontVariables}>
      <body>
        <PaginaErro
          codigo="Erro crítico de sistema"
          titulo="Ocorreu uma falha inesperada"
          descricao="Uma falha impediu o carregamento da aplicação. Você pode tentar de novo agora; se o problema continuar, volte mais tarde."
          auditId={error.digest}
        >
          <Button variante="primaria" onClick={reset} className="w-full sm:w-auto">
            Tentar novamente
          </Button>
          <Button variante="secundaria" asChild className="w-full sm:w-auto">
            <a href="/">Voltar ao início</a>
          </Button>
        </PaginaErro>
      </body>
    </html>
  );
}
