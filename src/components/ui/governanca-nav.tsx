"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface GovernancaItem {
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
    { href: "/alertas-risco", label: "Alertas de Risco" },
  ];

  return (
    <nav
      aria-label="Navegação da Central de Governança"
      className="mb-4 flex scrollbar-none items-center gap-1 overflow-x-auto rounded-[var(--radius-card)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-1.5 shadow-xs"
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/validacao" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "font-display inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border-2 px-3 py-1.5 text-sm font-semibold transition-all duration-100 ease-out",
              isActive
                ? "border-[var(--border-brutal)] bg-[var(--action-primary)] font-bold text-[var(--action-primary-fg)] shadow-[var(--ds-shadow)]"
                : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-brutal)]/40 hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 ? (
              <span className="rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
