import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { Logo } from "@/components/ui/logo";
import { listarPendencias } from "./pendencias/queries";
import { SignOutButton } from "./sign-out-button";

/**
 * Shell protegido. `getTenantContext` resolve tenant e redireciona sozinho
 * (login / seleção / sem-acesso) quando o status não é "ok" — nenhuma página
 * dentro de (app) precisa repetir a guarda. Header traz clínica ativa +
 * switcher + sair. O link de Pendências mostra a contagem total (N) — o RLS já
 * escopa `listarPendencias` por papel/tenant, então N reflete só o que este
 * usuário pode ver.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const clinicas = await listarClinicasDoUsuario(ctx.userId);
  const { total: totalPendencias } = await listarPendencias(ctx);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ink-anchor flex flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/agenda" aria-label="Iris — início" className="shrink-0">
            <Logo variante="completo" altura={28} />
          </Link>
          <ClinicSwitcher clinicas={clinicas} ativaId={ctx.clinicId} />
        </div>
        <nav aria-label="Navegação principal" className="flex items-center gap-4">
          <Link
            href="/agenda"
            className="font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline"
          >
            Agenda
          </Link>
          <Link
            href="/pendencias"
            className="font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline"
          >
            Pendências ({totalPendencias})
          </Link>
          {ctx.role === "coordenador" ? (
            <Link
              href="/excecoes"
              className="font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline"
            >
              Exceções
            </Link>
          ) : null}
          <SignOutButton />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
