import { Logo } from "@/components/ui/logo";
import { MfaVerifyForm } from "./mfa-verify-form";

/**
 * Passo de 2º fator no login (Fase 6.2b). Área (auth), sem guard: a sessão só
 * existe DEPOIS de verificar, então o shell protegido ainda não se aplica.
 */
export default function MfaVerifyPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Verificação em duas etapas
        </h1>
      </div>
      <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]">
        <MfaVerifyForm />
      </div>
    </div>
  );
}
