import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { surface } from "@/components/ui/primitives/surface";
import { EsqueciSenhaForm } from "./esqueci-senha-form";

export const metadata = {
  title: "Recuperar senha — Iris",
  description: "Recuperação de senha do Iris.",
};

/**
 * Tela de recuperação de senha (Fatia A, Task 9). Mesmo desenho visual de
 * `/login` e `/cadastro`: cartão centralizado no layout de `(auth)`.
 */
export default function EsqueciSenhaPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Recuperar senha
        </h1>
        <p className="text-[var(--text-secondary)] font-body text-sm">
          Informe o e-mail da sua conta para receber um link de redefinição
          de senha.
        </p>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6",
        })}
      >
        <EsqueciSenhaForm />
      </div>

      <p className="text-[var(--text-secondary)] text-center text-sm">
        Lembrou a senha?{" "}
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
