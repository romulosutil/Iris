"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface GovernancaItem {
  href: string;
  label: string;
  badge?: number;
}

export function GovernancaNav() {
  const pathname = usePathname();

  const items: GovernancaItem[] = [
    { href: "/validacao", label: "Fila de Validação" },
    { href: "/excecoes", label: "Exceções Clínicas" },
    { href: "/supervisao", label: "Supervisão & Estagnação" },
    { href: "/pendencias", label: "Pendências Gerais" },
  ];

  return (
    <nav
      aria-label="Navegação da Central de Governança"
      className="flex items-center gap-1 border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-1.5 rounded-[var(--radius-card)] shadow-xs overflow-x-auto scrollbar-none mb-4"
    >
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/validacao" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "font-display text-sm font-semibold px-3 py-1.5 rounded-[var(--radius-control)] transition-all duration-100 ease-out inline-flex items-center gap-2 border-2 shrink-0",
              isActive
                ? "bg-[var(--action-primary)] text-[var(--action-primary-fg)] font-bold border-[var(--border-brutal)] shadow-[var(--ds-shadow)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-brutal)]/40 hover:bg-[var(--surface-elevated)]",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 ? (
              <span className="font-mono text-xs px-2 py-0.5 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] font-bold">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
