"use client";

import * as React from "react";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { surface } from "@/components/ui/primitives/surface";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Página 500 Global (Next.js global-error.tsx).
 * Captura falhas críticas no layout raiz. Define suas próprias tags <html> e <body>.
 * Estética do Espectro Brutal com Card elevado, bordas sólidas #1A1A1A, sombra dura,
 * Audit Error ID seguro, botão de reexecução e retorno à rota segura.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    console.error("Erro global capturado no root layout:", error);
  }, [error]);

  const auditId = error?.digest || "SEC-500-ERR";

  return (
    <html
      lang="pt-BR"
      data-mode="clinico"
      className={`${spaceGrotesk.variable} ${jakarta.variable}`}
    >
      <body className="bg-[var(--color-bg-canvas)] min-h-dvh flex items-center justify-center p-4">
        <main className="mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16">
          <Logo variante="completo" altura={36} className="mb-2" />

          <div
            className={surface("solida", {
              radius: "control",
              className: "flex flex-col gap-4 p-6 bg-[var(--surface-card)] text-[var(--text-primary)] w-full border-[#1A1A1A] border-2",
            })}
          >
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
                Erro Crítico de Sistema
              </p>
              <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold text-balance md:text-3xl">
                Ocorreu uma falha inesperada
              </h1>
              <p className="text-[var(--text-primary)] text-sm md:text-base leading-relaxed">
                Nossos sistemas detectaram uma instabilidade e os engenheiros já foram
                notificados para atuar no reparo imediato. Fique tranquilo: seus dados
                e histórico clínico continuam totalmente seguros sob criptografia de ponta.
              </p>

              <div className="bg-[var(--status-error-bg)] border border-[var(--status-error-border)] rounded-[var(--radius-xs)] p-3 text-xs font-mono text-[var(--status-error-fg)] mt-2">
                <span className="font-bold">ID do Erro (Audit Error ID):</span> {auditId}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <Button variante="primaria" onClick={() => reset()} className="w-full sm:w-auto">
                Tentar Novamente
              </Button>
              <Button variante="secundaria" asChild className="w-full sm:w-auto">
                <a href="/agenda">
                  Ir para a agenda
                </a>
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
