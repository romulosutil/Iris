import { Logo } from "@/components/ui/logo";
import { MfaVerifyForm } from "./mfa-verify-form";

/**
 * Passo de 2º fator no login (Fase 6.2b). Área (auth), sem guard: a sessão só
 * existe DEPOIS de verificar, então o shell protegido ainda não se aplica.
 */
export default function MfaVerifyPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold">
          Verificação em duas etapas
        </h1>
      </div>
      <div className="bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] p-6">
        <MfaVerifyForm />
      </div>
    </div>
  );
}
