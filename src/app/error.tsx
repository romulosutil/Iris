"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

/**
 * Handler de erro 500 (Internal Server Error) on-brand (espectro-brutal).
 * Atua como Error Boundary do React para o Next.js App Router.
 * Loga detalhes de forma segura no lado do cliente/servidor sem expor
 * dados sensíveis como stack traces, SQL ou erros brutos para o usuário no DOM.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log seguro do erro sem vazar para o DOM do usuário final
    console.error("Erro de Sistema (500):", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-8 px-6 py-16">
      <Logo variante="completo" altura={36} />
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
          Erro de Sistema (500)
        </p>
        <h1 className="font-display text-[var(--text-primary)] text-4xl font-bold text-balance md:text-5xl">
          Algo deu errado do nosso lado.
        </h1>
        <p className="text-[var(--text-primary)] max-w-[60ch] text-lg">
          Ocorreu um erro interno inesperado. Nossa equipe de engenharia já foi
          notificada e está trabalhando para resolver o problema. Nada quebrou
          no seu navegador.
        </p>
        {error?.digest && (
          <p className="font-mono text-[var(--text-secondary)] text-xs mt-2">
            Código de rastreamento: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
        <Button
          onClick={() => reset()}
          variante="primaria"
          className="font-semibold"
        >
          Tentar novamente
        </Button>
        <Link
          href="/agenda"
          className="font-display text-[var(--action-secondary-fg)] border-[var(--border-brutal)] bg-[var(--action-secondary-bg)] border-2 rounded-[var(--radius-control)] px-5 py-2.5 text-base font-semibold text-center underline-offset-4 shadow-[var(--ds-shadow)] hover:underline active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-75"
        >
          Voltar para a agenda
        </Link>
      </div>
    </main>
  );
}
