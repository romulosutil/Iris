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
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Criar conta
        </h1>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6",
        })}
      >
        <CadastroForm />
      </div>
    </div>
  );
}
