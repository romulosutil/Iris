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

  let itemsNav: NavItem[] = [];

  if (ctx.role === "coordenador") {
    itemsNav = [
      { href: "/validacao", label: "Central de Validação", badge: totalPendencias },
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/equipe", label: "Equipe" },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else if (ctx.role === "terapeuta") {
    itemsNav = [
      { href: "/agenda", label: "Agenda do Dia" },
      { href: "/pacientes", label: "Pacientes & PEIs" },
      { href: "/pendencias", label: "Pendências", badge: totalPendencias },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else {
    itemsNav = [
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/pendencias", label: "Pendências", badge: totalPendencias },
    ];
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
