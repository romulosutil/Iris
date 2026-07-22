"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header, type NavItem as HeaderNavItem } from "@/components/ui/header";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface AppHeaderProps {
  clinicas: { clinicId: string; nome: string }[];
  ativaId: string;
  role: string;
  itemsNav: NavItem[];
  signOutSlot: React.ReactNode;
}

export function AppHeader({
  clinicas,
  ativaId,
  itemsNav,
  signOutSlot,
}: AppHeaderProps) {
  const pathname = usePathname();

  const clinicaAtiva = clinicas.find((c) => c.clinicId === ativaId);
  const outrasClinicas = clinicas
    .filter((c) => c.clinicId !== ativaId)
    .map((c) => ({ id: c.clinicId, nome: c.nome }));

  const navItemsComEstado: HeaderNavItem[] = itemsNav.map((item) => {
    const isExact = pathname === item.href;
    const isGovernanca =
      item.href === "/validacao" &&
      (pathname.startsWith("/validacao") ||
        pathname.startsWith("/excecoes") ||
        pathname.startsWith("/supervisao"));
    const isSubPath = item.href !== "/" && pathname.startsWith(item.href);

    return {
      ...item,
      active: isExact || isGovernanca || isSubPath,
    };
  });


  const handleTrocarClinica = async (clinicId: string) => {
    const { definirClinicaAtiva } = await import("@/auth/actions");
    await definirClinicaAtiva(clinicId);
  };

  return (
    <Header
      clinicaAtivaNome={clinicaAtiva?.nome ?? "Clínica Ativa"}
      outrasClinicas={outrasClinicas}
      onTrocarClinica={handleTrocarClinica}
      itemsNav={navItemsComEstado}
      signOutSlot={signOutSlot}
      renderLink={(item, children, className) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={className}
        >
          {children}
        </Link>
      )}
    />
  );
}
