"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Header,
  type NavBadgeTom,
  type NavItem as HeaderNavItem,
} from "@/components/ui/header";
import { Rail } from "@/components/ui/rail";

export interface NavItem {
  href: string;
  label: string;
  labelCurto?: string;
  badge?: number;
  badgeTom?: NavBadgeTom;
}

/**
 * #512 · R-24 — rótulo legível por papel. Espelha o mapa de
 * `src/app/(auth)/selecionar-papel/page.tsx` de propósito: são dois pontos de
 * exibição independentes (seleção inicial vs. troca no shell), duplicar 3
 * linhas custa menos do que acoplar uma tela de auth a este componente.
 */
const ROTULO_PAPEL: Record<string, string> = {
  coordenador: "Coordenação",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

export interface AppHeaderProps {
  clinicas: { clinicId: string; nome: string }[];
  ativaId: string;
  role: string;
  /** Outros papéis do usuário na clínica ativa (combo disjunto, R-09/E6).
   * Vazio quando não há o que trocar — é o caso comum. */
  papeisAlternativos?: string[];
  itemsNav: NavItem[];
  /** #512 · T09 (R-22) — administração, fora do menu diário: vive no menu do
   * usuário no rodapé do rail (desktop) e numa seção própria do drawer
   * mobile. */
  itemsAdmin?: NavItem[];
  signOutSlot: React.ReactNode;
  children?: React.ReactNode;
}

export function AppHeader({
  clinicas,
  ativaId,
  role,
  papeisAlternativos = [],
  itemsNav,
  itemsAdmin = [],
  signOutSlot,
  children,
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
        pathname.startsWith("/supervisao") ||
        pathname.startsWith("/alertas-risco"));
    const isSubPath = item.href !== "/" && pathname.startsWith(item.href);

    return {
      ...item,
      active: isExact || isGovernanca || isSubPath,
    };
  });

  const itemsAdminComEstado: HeaderNavItem[] = itemsAdmin.map((item) => ({
    ...item,
    active:
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href)),
  }));

  const handleTrocarClinica = async (clinicId: string) => {
    const { definirClinicaAtiva } = await import("@/auth/actions");
    await definirClinicaAtiva(clinicId);
  };

  // #512 · R-24 — troca de papel via cookie (`definirPapelAtivo`), mesmo
  // mecanismo já usado por `/selecionar-papel`. Import dinâmico: server
  // action não pode ser importada estaticamente num módulo "use client" sem
  // puxar código de servidor para o bundle do cliente.
  const handleTrocarPapel = async (papel: string) => {
    const { definirPapelAtivo } = await import("@/auth/actions");
    await definirPapelAtivo(papel);
  };

  const papelAtivoRotulo = ROTULO_PAPEL[role] ?? role;
  const papeisAlternativosResolvidos = papeisAlternativos
    .filter((p) => p !== role)
    .map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] ?? p }));

  const linkCompartilhado = (
    item: HeaderNavItem,
    conteudo: React.ReactNode,
    className: string,
  ) => (
    <Link
      key={item.href}
      href={item.href}
      aria-label={item.label}
      aria-current={item.active ? "page" : undefined}
      // R-26 — tooltip nativo por ícone (rail colapsado); inofensivo/redundante
      // nos demais destinos, onde o rótulo já é texto visível.
      title={item.label}
      className={className}
    >
      {conteudo}
    </Link>
  );

  return (
    // #512 · T08 — rail lateral (desktop, R-25) ao lado de uma coluna que
    // carrega a faixa superior (`Header`, com o papel ativo — R-24) e todo o
    // resto da página. `Header` continua sozinho abaixo de `lg` (a `BottomNav`
    // que ele já monta satisfaz R-27 desde #185; não é tocada aqui).
    <div className="flex min-h-dvh w-full bg-[var(--bg-app)]">
      <Rail
        itemsNav={navItemsComEstado}
        itemsAdmin={itemsAdminComEstado}
        renderLink={linkCompartilhado}
        renderAdminLink={linkCompartilhado}
      />
      <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
        <Header
          clinicaAtivaNome={clinicaAtiva?.nome ?? "Clínica Ativa"}
          outrasClinicas={outrasClinicas}
          onTrocarClinica={handleTrocarClinica}
          papelAtivoRotulo={papelAtivoRotulo}
          papeisAlternativos={papeisAlternativosResolvidos}
          onTrocarPapel={handleTrocarPapel}
          itemsNav={navItemsComEstado}
          itemsAdmin={itemsAdminComEstado}
          signOutSlot={signOutSlot}
          renderLink={linkCompartilhado}
        />
        {children}
      </div>
    </div>
  );
}
