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
  activeHref?: string;
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
 * O visual segue o padrão *underline tabs* do Espectro Brutal (§203):
 * linha de base sólida (`border-b-2 border-[var(--border-brutal)]`), fundo neutro
 * de superfície elevada (`--surface-elevated`), texto em alto contraste e
 * indicador inferior discreto em tom Amarelo Ouro (`var(--action-primary, #F2B705)`).
 *
 * Acessibilidade:
 * - `<nav aria-label>` em vez do padrão `role="tablist"`: com navegação real
 *   entre documentos, `tablist` prometeria ao leitor de tela uma troca de painel
 *   que não vai acontecer. Lista de links é a descrição honesta.
 * - `aria-current="page"` marca a aba ativa sem depender de cor.
 * - Alvo de 44px (`min-h-11`) preservado, e a faixa rola na horizontal no
 *   mobile em vez de espremer os rótulos.
 */
export function TabsNav({
  itens,
  ariaLabel,
  activeHref,
  className,
}: TabsNavProps) {
  const pathname = usePathname();
  const currentPath = activeHref ?? pathname ?? "";

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
          ? currentPath === item.href
          : currentPath === item.href ||
            (currentPath ? currentPath.startsWith(`${item.href}/`) : false);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "font-display -mb-0.5 inline-flex min-h-11 shrink-0 items-center border-2 border-transparent px-4 py-2 text-base font-semibold text-[var(--text-secondary)] transition-colors duration-100 ease-out",
              "hover:border-[var(--border-brutal)]/40 hover:bg-[var(--gray-light-hover)]/40 hover:text-[var(--text-primary)]",
              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:-outline-offset-[var(--ring-offset)]",
              ativo &&
                "rounded-t-[var(--radius-control)] border-b-[3px] border-[var(--border-brutal)] border-b-[var(--action-primary,#F2B705)] bg-[var(--surface-elevated)] font-bold text-[var(--text-primary)] shadow-none",
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
