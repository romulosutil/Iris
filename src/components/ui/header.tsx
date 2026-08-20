"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Split, Cluster, Container } from "@/components/ui/layout";
import type { ContainerProps } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  active?: boolean;
}

export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  clinicaAtivaNome?: string;
  outrasClinicas?: { id: string; nome: string }[];
  onTrocarClinica?: (id: string) => void;
  itemsNav: NavItem[];
  usuarioNome?: string;
  /**
   * Largura da faixa interna. Deve espelhar a `largura` do `Container` que
   * envolve o conteúdo da página: o fundo e a borda seguem sangrando de ponta a
   * ponta, mas marca e controles do usuário passam a nascer e morrer na mesma
   * coluna do título da página. Sem isto o header colava nas bordas do viewport
   * enquanto o conteúdo centralizava — duas colunas distintas na mesma tela.
   */
  largura?: ContainerProps["largura"];
  onSignOut?: () => void;
  signOutSlot?: React.ReactNode;
  renderLink?: (
    item: NavItem,
    children: React.ReactNode,
    className: string,
  ) => React.ReactNode;
}

function MenuIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export const Header = React.forwardRef<HTMLElement, HeaderProps>(
  function Header(
    {
      className,
      clinicaAtivaNome = "Clínica Iris",
      outrasClinicas = [],
      onTrocarClinica,
      itemsNav = [],
      usuarioNome,
      largura = "md",
      onSignOut,
      signOutSlot,
      renderLink,
      ...props
    },
    ref,
  ) {
    const [drawerOpen, setDrawerOpen] = React.useState(false);

    const getItemClassName = (item: NavItem) =>
      cn(
        "font-display text-sm px-3.5 py-1.5 rounded-[var(--radius-control)] transition-all duration-100 ease-out inline-flex items-center gap-2 border-2",
        item.active
          ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] font-bold border-[var(--border-brutal)] border-b-2 border-b-[var(--action-primary,#F2B705)] shadow-[var(--elevation-1)]"
          : "border-transparent text-[var(--text-secondary)] font-semibold hover:border-[var(--border-brutal)]/30 hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
      );

    const linkRenderer = (item: NavItem, children: React.ReactNode) => {
      const itemClass = getItemClassName(item);
      if (renderLink) {
        return renderLink(item, children, itemClass);
      }
      return (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={itemClass}
        >
          {children}
        </a>
      );
    };

    return (
      <header
        ref={ref}
        className={cn(
          "sticky top-0 z-40 border-b-2 border-[var(--border-brutal)] bg-[var(--surface-card)]/95 shadow-[var(--ds-shadow)] backdrop-blur-md",
          className,
        )}
        {...props}
      >
        <Container largura={largura}>
          <Split className="min-h-[64px] py-3 sm:min-h-[72px]">
            {/* Marca + Clínica */}
            <Cluster
              gap="sm"
              className="w-full items-center justify-between sm:w-auto"
            >
              <Link
                href="/"
                aria-label="Iris — Início"
                className="focus-visible:outline-focus flex min-h-[44px] min-w-[44px] shrink-0 items-center"
              >
                <Logo variante="completo" altura={36} />
              </Link>

              {/* Clínica ativa (Desktop) */}
              <div className="hidden items-center gap-2 sm:flex">
                <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {clinicaAtivaNome}
                </span>
                {outrasClinicas.map((c) => (
                  <Button
                    key={c.id}
                    variante="neutra"
                    tamanho="sm"
                    onClick={() => onTrocarClinica?.(c.id)}
                  >
                    Trocar para {c.nome}
                  </Button>
                ))}
              </div>

              {/* Botão Hambúrguer (Mobile < 640px) */}
              <div className="sm:hidden">
                <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <DrawerTrigger asChild>
                    <Button
                      variante="secundaria"
                      tamanho="sm"
                      aria-label="Abrir menu de navegação"
                    >
                      <MenuIcon />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent posicao="right">
                    <DrawerHeader>
                      <DrawerTitle>Menu Principal</DrawerTitle>
                    </DrawerHeader>

                    <div className="flex flex-col gap-4 py-4">
                      <div className="border-b border-[var(--border-brutal)]/30 pb-2">
                        <p className="mb-1 font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase">
                          Clínica Ativa
                        </p>
                        <p className="font-display text-base font-bold text-[var(--text-primary)]">
                          {clinicaAtivaNome}
                        </p>
                        {outrasClinicas.map((c) => (
                          <Button
                            key={c.id}
                            variante="neutra"
                            tamanho="sm"
                            className="mt-2 w-full justify-start"
                            onClick={() => {
                              onTrocarClinica?.(c.id);
                              setDrawerOpen(false);
                            }}
                          >
                            Trocar para {c.nome}
                          </Button>
                        ))}
                      </div>

                      <nav
                        aria-label="Navegação mobile"
                        className="flex flex-col gap-2"
                      >
                        {itemsNav.map((item) => {
                          const content = (
                            <span className="flex w-full items-center justify-between">
                              <span>{item.label}</span>
                              {item.badge !== undefined && item.badge > 0 ? (
                                <span className="rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
                                  {item.badge}
                                </span>
                              ) : null}
                            </span>
                          );

                          return (
                            <div
                              key={item.href}
                              onClick={() => setDrawerOpen(false)}
                              className="w-full"
                            >
                              {linkRenderer(item, content)}
                            </div>
                          );
                        })}
                      </nav>
                    </div>

                    <DrawerFooter>
                      {signOutSlot ? (
                        signOutSlot
                      ) : onSignOut ? (
                        <Button
                          variante="terciaria"
                          tamanho="sm"
                          onClick={onSignOut}
                        >
                          Sair da conta
                        </Button>
                      ) : null}
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
            </Cluster>

            {/* Navegação Desktop (≥ 640px) */}
            <Cluster
              como="nav"
              gap="xs"
              aria-label="Navegação principal"
              className="hidden flex-wrap items-center sm:flex"
            >
              {itemsNav.map((item) => {
                const labelWithBadge = (
                  <>
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 ? (
                      <span className="rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                );
                return linkRenderer(item, labelWithBadge);
              })}

              {signOutSlot ? (
                <div className="ml-2">{signOutSlot}</div>
              ) : onSignOut ? (
                <Button
                  variante="neutra"
                  tamanho="sm"
                  onClick={onSignOut}
                  className="ml-2"
                >
                  Sair
                </Button>
              ) : null}
            </Cluster>
          </Split>
        </Container>
      </header>
    );
  },
);
