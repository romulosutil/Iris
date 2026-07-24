import { Logo } from "@/components/ui/logo";
import { MfaSetupForm } from "./mfa-setup-form";

/**
 * Onboarding de MFA (Fase 6.2b). Vive na área (auth) — sem guard de
 * getTenantContext — para não colidir com o enforcement do shell (evita loop de
 * redirect). Um papel clínico sem MFA cai aqui via getTenantContext.
 */
export default function MfaSetupPage() {
  return <MfaSetupForm />;
}
