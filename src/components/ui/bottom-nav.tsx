"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { NavItem, NavBadgeTom } from "@/components/ui/header";
import { useTecladoVirtualAberto } from "@/lib/hooks/use-teclado-virtual";

/**
 * Quantos destinos cabem na barra antes do slot de menu.
 *
 * Em 360px, 5 slots dão ~72px cada — o piso de 44px de toque com folga para o
 * rótulo. Um 6º slot derruba o rótulo abaixo do legível.
 */
export const MAX_ITENS_BOTTOM_NAV = 4;

const badgeTomClasse: Record<NavBadgeTom, string> = {
  neutro:
    "border-[var(--surface-muted-border)] bg-[var(--surface-muted)] text-[var(--text-primary)]",
  ia: "border-[var(--status-ia-border)] bg-[var(--status-ia-bg)] text-[var(--status-ia-fg)]",
  risco:
    "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
};

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

export interface BottomNavProps {
  /** Lista completa de destinos do papel. A barra fatia os 4 primeiros. */
  items: NavItem[];
  /** Abre o Drawer que já existe no `Header` — a barra não tem estado próprio. */
  onAbrirMenu: () => void;
  renderLink?: (
    item: NavItem,
    children: React.ReactNode,
    className: string,
  ) => React.ReactNode;
}

/**
 * Bottom Navigation Bar do app logado em telas de celular (#185, Etapa 1).
 *
 * Por que os 4 PRIMEIROS itens e não uma lista configurável: `AppLayout` já
 * monta `itemsNav` em ordem de prioridade por papel (coordenador abre na
 * Central de Validação; terapeuta abre na Agenda do Dia). Uma segunda lista de
 * "itens da barra" seria um lugar a mais para esquecer de atualizar quando um
 * papel novo nascer — e o modo de falha seria silencioso: barra vazia.
 *
 * A barra NÃO substitui o Drawer. Ela é o único gatilho dele abaixo de `sm`,
 * porque o coordenador tem 9 destinos e só 4 cabem aqui.
 */
export function BottomNav({ items, onAbrirMenu, renderLink }: BottomNavProps) {
  // Hook antes de qualquer retorno antecipado: as regras dos Hooks proíbem
  // chamada condicional, e `items` vazio é um retorno antecipado.
  const tecladoAberto = useTecladoVirtualAberto();

  if (items.length === 0) return null;
  // Com o teclado aberto a barra rouba a faixa onde ficam os botões de salvar
  // do editor de diário e da barra de lote. Sair de cena é o comportamento
  // certo: o usuário está digitando, não navegando.
  if (tecladoAberto) return null;

  const visiveis = items.slice(0, MAX_ITENS_BOTTOM_NAV);

  const classeSlot =
    "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 " +
    "px-1 py-2 font-display text-[11px] font-semibold leading-tight text-center " +
    "focus-visible:outline-focus";

  const classeItem = (item: NavItem) =>
    cn(
      classeSlot,
      item.active
        ? "border-t-2 border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)]"
        : "border-t-2 border-transparent text-[var(--text-secondary)]",
    );

  const conteudo = (item: NavItem) => (
    <>
      <span className="w-full truncate">{item.labelCurto ?? item.label}</span>
      {item.badge !== undefined && item.badge > 0 ? (
        <span
          className={cn(
            "absolute top-1 right-1/4 rounded-[var(--radius-pill)] border px-1.5 font-mono text-[10px] font-bold",
            badgeTomClasse[item.badgeTom ?? "neutro"],
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <nav
      aria-label="Navegação rápida"
      className={cn(
        // `fixed` posiciona pelo viewport mesmo renderizado de dentro do
        // <header>. `pb-[env(...)]` depende do `viewport-fit=cover` declarado
        // em `src/app/layout.tsx`.
        "fixed inset-x-0 bottom-0 z-50 flex items-stretch",
        "border-t-2 border-[var(--border-brutal)] bg-[var(--surface-card)]",
        "pb-[env(safe-area-inset-bottom)] shadow-[var(--ds-shadow)]",
        "sm:hidden",
      )}
    >
      {visiveis.map((item) => {
        const classe = classeItem(item);
        if (renderLink) return renderLink(item, conteudo(item), classe);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            className={classe}
          >
            {conteudo(item)}
          </a>
        );
      })}

      <button
        type="button"
        onClick={onAbrirMenu}
        aria-label="Abrir menu de navegação"
        className={cn(
          classeSlot,
          "border-t-2 border-transparent text-[var(--text-secondary)]",
        )}
      >
        <MenuIcon />
        <span>Menu</span>
      </button>
    </nav>
  );
}
