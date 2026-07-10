import type { ReactNode } from "react";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { SignOutButton } from "./sign-out-button";

/**
 * Shell protegido. `getTenantContext` resolve tenant e redireciona sozinho
 * (login / seleção / sem-acesso) quando o status não é "ok" — nenhuma página
 * dentro de (app) precisa repetir a guarda. Header traz clínica ativa +
 * switcher + sair.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const clinicas = await listarClinicasDoUsuario(ctx.userId);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ink-anchor flex flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-4">
        <ClinicSwitcher clinicas={clinicas} ativaId={ctx.clinicId} />
        <SignOutButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
