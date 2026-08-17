import { Logo } from "@/components/ui/logo";
import { surface } from "@/components/ui/primitives/surface";
import { CadastroForm } from "./cadastro-form";

export const metadata = {
  title: "Criar conta — Iris",
  description: "Cadastro self-service de clínica no Iris.",
};

/**
 * Tela de cadastro self-service (Fatia A). Mesmo desenho visual de
 * `/login`: cartão centralizado no layout de `(auth)`, título + logo acima,
 * formulário dentro do cartão.
 */
export default function CadastroPage() {
  return (
    <div className="my-4 flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo altura={44} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Criar conta no Iris
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Governança clínica, dossiês automatizados e evidências rastreáveis.
        </p>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6 sm:p-8",
        })}
      >
        <CadastroForm />
      </div>
    </div>
  );
}
