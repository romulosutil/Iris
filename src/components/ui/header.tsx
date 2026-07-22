"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Split, Cluster } from "@/components/ui/layout";
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
  onSignOut?: () => void;
  renderLink?: (item: NavItem, children: React.ReactNode) => React.ReactNode;
}

function MenuIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

export const Header = React.forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    className,
    clinicaAtivaNome = "Clínica Iris",
    outrasClinicas = [],
    onTrocarClinica,
    itemsNav = [],
    usuarioNome,
    onSignOut,
    renderLink,
    ...props
  },
  ref,
) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const defaultRenderLink = (item: NavItem, children: React.ReactNode) => (
    <a
      key={item.href}
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "inline-block font-display underline-offset-4 transition-transform duration-100 ease-out hover:-translate-y-0.5 font-semibold text-sm",
        item.active
          ? "text-[var(--text-primary)] underline font-bold"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline",
      )}
    >
      {children}
    </a>
  );

  const linkRenderer = renderLink ?? defaultRenderLink;

  return (
    <Split
      ref={ref}
      como="header"
      className={cn(
        "border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)] border-b-2 px-4 sm:px-6 py-3.5",
        className,
      )}
      {...props}
    >
      {/* Marca + Clínica */}
      <Cluster gap="sm" className="items-center justify-between w-full sm:w-auto">
        <a href="/" aria-label="Iris — início" className="shrink-0">
          <Logo variante="completo" altura={28} />
        </a>

        {/* Clínica ativa (Desktop) */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="font-display text-[var(--text-primary)] font-semibold text-sm">
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
              <Button variante="secundaria" tamanho="sm" aria-label="Abrir menu de navegação">
                <MenuIcon />
              </Button>
            </DrawerTrigger>
            <DrawerContent posicao="right">
              <DrawerHeader>
                <DrawerTitle>Menu Principal</DrawerTitle>
              </DrawerHeader>

              <div className="py-4 flex flex-col gap-4">
                <div className="pb-2 border-b border-[var(--border-brutal)]/30">
                  <p className="text-xs font-mono font-semibold uppercase text-[var(--text-secondary)] mb-1">
                    Clínica Ativa
                  </p>
                  <p className="font-display text-[var(--text-primary)] font-bold text-base">
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

                <nav aria-label="Navegação mobile" className="flex flex-col gap-2">
                  {itemsNav.map((item) => {
                    const content = (
                      <span className="flex items-center justify-between w-full">
                        <span>{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] font-bold">
                            {item.badge}
                          </span>
                        ) : null}
                      </span>
                    );

                    return (
                      <div
                        key={item.href}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-[var(--radius-control)] font-display text-base font-semibold border-2 transition-colors",
                          item.active
                            ? "border-[var(--border-brutal)] bg-[var(--action-primary)] text-[var(--action-primary-fg)] shadow-[var(--ds-shadow)]"
                            : "border-transparent text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]",
                        )}
                      >
                        {linkRenderer(item, content)}
                      </div>
                    );
                  })}
                </nav>
              </div>

              <DrawerFooter>
                {onSignOut ? (
                  <Button variante="terciaria" tamanho="sm" onClick={onSignOut}>
                    Sair da conta
                  </Button>
                ) : null}
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </Cluster>

      {/* Navegação Desktop (≥ 640px) */}
      <Cluster como="nav" gap="md" aria-label="Navegação principal" className="hidden sm:flex items-center">
        {itemsNav.map((item) => {
          const labelWithBadge = (
            <>
              {item.label}{" "}
              {item.badge !== undefined && item.badge > 0 ? (
                <span className="font-mono text-xs font-bold font-normal">({item.badge})</span>
              ) : null}
            </>
          );
          return linkRenderer(item, labelWithBadge);
        })}

        {onSignOut ? (
          <Button variante="neutra" tamanho="sm" onClick={onSignOut}>
            Sair
          </Button>
        ) : null}
      </Cluster>
    </Split>
  );
});
