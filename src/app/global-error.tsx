"use client";

import { useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

/**
 * Global Error Boundary do Next.js App Router para capturar falhas críticas no root layout.tsx.
 * Renderiza suas próprias tags <html> e <body> porque substitui o layout raiz.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log seguro do erro sem vazar para o DOM do usuário final
    console.error("Erro Global Crítico (500):", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased bg-[var(--surface-primary,#fdfbf7)]">
        <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-8 px-6 py-16">
          <Logo variante="completo" altura={36} />
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[var(--text-secondary,#4a4a4a)] text-xs font-semibold tracking-wide uppercase">
              Erro Crítico de Sistema (500)
            </p>
            <h1 className="font-display text-[var(--text-primary,#000000)] text-4xl font-bold text-balance md:text-5xl">
              Algo deu errado do nosso lado.
            </h1>
            <p className="text-[var(--text-primary,#000000)] max-w-[60ch] text-lg">
              Ocorreu uma falha grave na inicialização da plataforma. Nossa
              equipe de engenharia foi alertada sobre esse incidente.
            </p>
            {error?.digest && (
              <p className="font-mono text-[var(--text-secondary,#4a4a4a)] text-xs mt-2">
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
            <a
              href="/agenda"
              className="font-display text-[var(--action-secondary-fg,#000000)] border-[var(--border-brutal,#000000)] bg-[var(--action-secondary-bg,#ffffff)] border-2 rounded-[var(--radius-control,4px)] px-5 py-2.5 text-base font-semibold text-center underline-offset-4 shadow-[var(--ds-shadow,4px_4px_0px_#000000)] hover:underline active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-75"
            >
              Ir para a página inicial
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
