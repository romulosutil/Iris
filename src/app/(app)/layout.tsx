import type { ReactNode } from "react";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { Container } from "@/components/ui/layout";
import { listarPendencias } from "./pendencias/queries";
import { SignOutButton } from "./sign-out-button";
import { AppHeader, type NavItem } from "./app-header";

/**
 * Shell protegido com suporte responsivo a Mobile e Desktop.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const clinicas = await listarClinicasDoUsuario(ctx.userId);
  const { total: totalPendencias } = await listarPendencias(ctx);

  const itemsNav: NavItem[] = [
    { href: "/agenda", label: "Agenda" },
    { href: "/pendencias", label: "Pendências", badge: totalPendencias },
  ];

  if (ctx.role === "coordenador" || ctx.role === "terapeuta") {
    itemsNav.push({ href: "/duvidas", label: "Dúvidas" });
  }

  if (ctx.role === "coordenador") {
    itemsNav.push(
      { href: "/excecoes", label: "Exceções" },
      { href: "/validacao", label: "Validação" },
      { href: "/supervisao", label: "Supervisão" },
      { href: "/equipe", label: "Equipe" },
      { href: "/clinica/feriados", label: "Feriados" },
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-app)]">
      <AppHeader
        clinicas={clinicas}
        ativaId={ctx.clinicId}
        role={ctx.role}
        itemsNav={itemsNav}
        signOutSlot={<SignOutButton />}
      />
      <Container como="main" largura="md" className="flex-1 py-6 sm:py-10">
        {children}
      </Container>
    </div>
  );
}
