"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { surface } from "@/components/ui/primitives/surface";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Página 500 para captura de falhas não tratadas em nível de rota (Next.js error.tsx).
 * Estética do Espectro Brutal com Card elevado, bordas sólidas #1A1A1A, sombra dura
 * e botões para reexecução (reset()) e retorno seguro à agenda.
 *
 * Guardrail Inegociável: Nunca exibe stack traces, queries SQL ou dados confidenciais.
 */
export default function ErrorPage({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    // Log seguro do erro no console (não visível ao usuário comum, útil para Sentry/logs)
    console.error("Erro interno capturado na rota:", error);
  }, [error]);

  // Next.js fornece error.digest como um hash único e seguro do erro em produção
  const auditId = error?.digest || "SEC-500-ERR";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16">
      <Logo variante="completo" altura={36} className="mb-2" />

      <div
        className={surface("solida", {
          radius: "control",
          className: "flex flex-col gap-4 p-6 bg-[var(--surface-card)] text-[var(--text-primary)] w-full border-[#1A1A1A] border-2",
        })}
      >
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[var(--text-secondary)] text-xs font-semibold tracking-wide uppercase">
            Erro 500
          </p>
          <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold text-balance md:text-3xl">
            Algo deu errado do nosso lado
          </h1>
          <p className="text-[var(--text-primary)] text-sm md:text-base leading-relaxed">
            Ocorreu um erro interno em nossos servidores. Nossa equipe técnica já foi
            notificada e está trabalhando para resolver a situação o quanto antes.
            Nenhum dado ou histórico clínico foi comprometido.
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
            <Link href="/agenda">
              Ir para a agenda
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
