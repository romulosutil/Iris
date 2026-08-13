"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { PaginaErro } from "@/components/ui/pagina-erro";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Página 500 de rota (Next.js error.tsx). Boundary de TODOS os segmentos —
 * (app), (auth) e rotas públicas — por isso a saída aponta para `/`, que
 * resolve o destino certo por estado de sessão (agenda para autenticado,
 * landing para visitante). Link é `<a>` de propósito: navegação completa
 * remonta a árvore quebrada, coisa que soft navigation não faz.
 *
 * Guardrail inegociável: nunca exibe stack trace, query SQL ou dado
 * confidencial — nem no HTML nem no console do navegador (o objeto de erro
 * de client component chega sem sanitização do Next, e o root layout monta
 * session recording). O erro vai para o GlitchTip via captureException.
 */
export default function ErrorPage({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <PaginaErro
      codigo="Erro 500"
      titulo="Algo deu errado do nosso lado"
      descricao="Ocorreu um erro interno. Você pode tentar de novo agora; se o problema continuar, volte ao início e tente mais tarde."
      auditId={error.digest}
    >
      <Button variante="primaria" onClick={reset} className="w-full sm:w-auto">
        Tentar novamente
      </Button>
      <Button variante="secundaria" asChild className="w-full sm:w-auto">
        <a href="/">Voltar ao início</a>
      </Button>
    </PaginaErro>
  );
}
