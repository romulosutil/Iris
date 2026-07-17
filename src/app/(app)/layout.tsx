import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { Logo } from "@/components/ui/logo";
import { Split, Cluster } from "@/components/ui/layout";
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
      <Split como="header" className="border-ink-anchor border-b-2 px-6 py-4">
        <Cluster gap="sm">
          <Link href="/agenda" aria-label="Iris — início" className="shrink-0">
            <Logo variante="completo" altura={28} />
          </Link>
          <ClinicSwitcher clinicas={clinicas} ativaId={ctx.clinicId} />
        </Cluster>
        <Cluster como="nav" gap="md" aria-label="Navegação principal">
          <Link
            href="/agenda"
            className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
          >
            Agenda
          </Link>
          <Link
            href="/pendencias"
            className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
          >
            Pendências ({totalPendencias})
          </Link>
          {ctx.role === "coordenador" ? (
            <Link
              href="/excecoes"
              className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
            >
              Exceções
            </Link>
          ) : null}
          {ctx.role === "coordenador" ? (
            <Link
              href="/equipe"
              className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
            >
              Equipe
            </Link>
          ) : null}
          {ctx.role === "coordenador" ? (
            <Link
              href="/clinica/feriados"
              className="inline-block font-display text-ink hover:text-ink-anchor underline-offset-4 hover:underline transition-transform duration-100 ease-out hover:-translate-y-0.5"
            >
              Feriados
            </Link>
          ) : null}
          <SignOutButton />
        </Cluster>
      </Split>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
