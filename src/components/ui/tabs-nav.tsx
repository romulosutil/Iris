"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabsNavItem {
  href: string;
  rotulo: string;
  /**
   * Casamento EXATO da rota. Necessário para a aba-índice de um segmento
   * dinâmico (ex.: `/pacientes/:id`), que é prefixo de todas as irmãs — sem
   * isto ela ficaria marcada como ativa em todas as abas ao mesmo tempo.
   */
  exato?: boolean;
}

export interface TabsNavProps {
  itens: TabsNavItem[];
  /** Rótulo do <nav>, obrigatório: uma tela pode ter mais de uma navegação. */
  ariaLabel: string;
  className?: string;
}

/**
 * Abas que são ROTAS, não estado local.
 *
 * Existe separado de `Tabs` (Radix) de propósito: o Radix troca painéis no
 * cliente e seus gatilhos são `<button>`. Aba que é rota precisa ser `<a>` de
 * verdade — abrir em nova guia, copiar link, botão "voltar" do browser e
 * pré-carregamento do Next só funcionam com `href`. Trocar isso por `button` +
 * `router.push` quebra quatro comportamentos que ninguém testa e todo mundo usa.
 *
 * O visual é literalmente o de `TabsList`/`TabsTrigger` para que abas de rota e
 * abas de estado não pareçam dois componentes diferentes na mesma aplicação.
 *
 * Acessibilidade:
 * - `<nav aria-label>` em vez do padrão `role="tablist"`: com navegação real
 *   entre documentos, `tablist` prometeria ao leitor de tela uma troca de painel
 *   que não vai acontecer. Lista de links é a descrição honesta.
 * - `aria-current="page"` marca a aba ativa sem depender de cor.
 * - Alvo de 44px (`min-h-11`) preservado, e a faixa rola na horizontal no
 *   mobile em vez de espremer os rótulos.
 */
export function TabsNav({ itens, ariaLabel, className }: TabsNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex scrollbar-none items-stretch overflow-x-auto border-b-2 border-[var(--border-brutal)]",
        className,
      )}
    >
      {itens.map((item) => {
        const ativo = item.exato
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "font-display -mb-0.5 inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 py-2 text-base font-semibold text-[var(--text-secondary)]",
              "hover:text-[var(--text-primary)]",
              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:-outline-offset-[var(--ring-offset)]",
              ativo &&
                "border-[var(--border-brutal)] bg-[var(--action-primary)] font-bold text-[var(--action-primary-fg)]",
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
