import { Logo } from "@/components/ui/logo";
import { MfaSetupForm } from "./mfa-setup-form";

/**
 * Onboarding de MFA (Fase 6.2b). Vive na área (auth) — sem guard de
 * getTenantContext — para não colidir com o enforcement do shell (evita loop de
 * redirect). Um papel clínico sem MFA cai aqui via getTenantContext.
 */
export default function MfaSetupPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold">
          Ativar verificação em duas etapas
        </h1>
      </div>
      <div className="bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] p-6">
        <MfaSetupForm />
      </div>
    </div>
  );
}
