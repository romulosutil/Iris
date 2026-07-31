import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { CadastroForm } from "./cadastro-form";

/**
 * Tela de cadastro self-service (Fatia A). Mesmo desenho visual de
 * `/login`: cartão centralizado no layout de `(auth)`, título + logo acima,
 * formulário dentro do cartão.
 */
export default function CadastroPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Criar conta
        </h1>
      </div>

      <div
        className={cn(
          "rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]",
        )}
      >
        <CadastroForm />
      </div>

      <p className="text-[var(--text-secondary)] text-center text-sm">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="text-[var(--text-primary)] font-semibold underline underline-offset-2"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
