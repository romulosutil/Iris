"use client";

import Link from "next/link";
import { Pill } from "@/components/ui/primitives/pill";
import { TabsNav } from "@/components/ui/tabs-nav";

interface AdminNavProps {
  userEmail: string;
}

/**
 * Cabeçalho do backoffice. As abas são o `TabsNav` do DS (abas que são ROTAS):
 * além do visual tokenizado, ele traz `aria-current="page"` e o alvo de toque
 * de 44px, que a versão anterior — um `map` de `<Link>` com classes cruas —
 * não tinha. `border-b-0` porque a linha de base aqui é a do próprio
 * `<header>`; duas linhas empilhadas seriam ruído.
 */
export function AdminNav({ userEmail }: AdminNavProps) {
  const itens = [
    { href: "/benjamin", rotulo: "Visão Geral", exato: true },
    { href: "/benjamin/clinicas", rotulo: "Clínicas" },
    { href: "/benjamin/saude", rotulo: "Saúde & Integrações" },
  ];

  return (
    <header className="border-b-2 border-[var(--border-brutal)] bg-[var(--bg-app)] text-[var(--text-primary)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-[var(--action-primary)]">
              IRIS
            </span>
            <Pill
              colorScheme="coral"
              size="sm"
              className="tracking-wider uppercase"
            >
              Super Admin
            </Pill>
          </div>

          <TabsNav
            itens={itens}
            ariaLabel="Seções do backoffice"
            className="border-b-0"
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="hidden rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-2.5 py-1 font-mono text-[var(--text-secondary)] sm:inline-block">
            {userEmail}
          </span>
          <Link
            href="/agenda"
            className="focus-visible:outline-focus min-h-11 rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-muted)] bg-[var(--surface-card)] px-3 py-2 font-semibold text-[var(--text-primary)] transition-colors outline-none hover:bg-[var(--surface-elevated)] focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
          >
            Voltar ao App
          </Link>
        </div>
      </div>
    </header>
  );
}
