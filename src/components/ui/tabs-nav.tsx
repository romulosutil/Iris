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
  /**
   * Aplica no elemento RAIZ do componente, que muda com `acoes`: sem `acoes` a
   * raiz é o próprio `<nav>`; com `acoes` é o wrapper que carrega a régua e a
   * área de ações. É o wrapper que precisa recebê-la — `admin-nav` passa
   * `border-b-0` para matar a régua, e ela mora no wrapper quando ele existe.
   * Não é concatenada no `<nav>` interno: ali ela duplicaria a régua em vez de
   * removê-la.
   */
  className?: string;
  /**
   * Conteúdo alinhado à direita, na MESMA faixa das abas: selos de estado da
   * entidade e um menu de ações raras (`MenuAcoes`). É o padrão de "abas com
   * área de ações" (repositório do GitHub, ficha do Linear): o que descreve
   * ou muda o estado da entidade inteira mora na linha da entidade, não numa
   * faixa solta entre a navegação e o título da aba — ali ele fica órfão, sem
   * relação visual com nada. Quando não cabe ao lado das abas, a área desce
   * para uma linha própria, alinhada à direita, em vez de espremer os rótulos.
   */
  acoes?: React.ReactNode;
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
  acoes,
}: TabsNavProps) {
  const pathname = usePathname();
  const currentPath = activeHref ?? pathname ?? "";

  const nav = (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex scrollbar-none items-stretch overflow-x-auto border-b-2 border-[var(--border-brutal)]",
        // Com ações ao lado: base = largura do conteúdo (`grow`, não `flex-1`,
        // cuja base é 0). É o que faz o `flex-wrap` do wrapper derrubar as
        // AÇÕES para a linha de baixo antes de espremer as abas — abas que
        // rolam num desktop de 1024px seriam regressão. `min-w-0` só entra em
        // jogo quando as abas sozinhas não cabem (mobile), e aí rolam como
        // sempre rolaram. A margem negativa sobrepõe a régua do wrapper com a
        // própria — na MESMA unidade da régua (`--border-brutal-width`, px),
        // não em `rem`: `-mb-0.5` só coincidia com `border-b-2` na fonte-raiz
        // de 16px; com zoom de fonte do usuário sobrava meio pixel de fresta.
        acoes ? "-mb-[var(--border-brutal-width)] min-w-0 grow" : className,
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
              "font-display -mb-[var(--border-brutal-width)] inline-flex min-h-11 shrink-0 items-center border-2 border-transparent px-4 py-2 text-base font-semibold text-[var(--text-secondary)] transition-colors duration-100 ease-out",
              "hover:rounded-t-[var(--radius-control)] hover:border-[var(--border-brutal)]/40 hover:bg-[var(--gray-light-hover)]/40 hover:text-[var(--text-primary)]",
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

  if (!acoes) return nav;

  return (
    // A régua mora no wrapper e o `<nav>` sobrepõe a sua em cima dela: na
    // mesma linha, as duas coincidem e a régua segue contínua até a margem
    // direita, por baixo das ações. Quando as ações descem de linha, fica uma
    // régua sob as abas e outra sob a linha das ações — e não um bloco
    // solto abaixo das abas sem ligação visual com nada.
    <div
      className={cn(
        "flex flex-wrap items-end border-b-2 border-[var(--border-brutal)]",
        className,
      )}
    >
      {nav}
      {/* `min-w-0` + `flex-wrap` próprio: num viewport mais estreito que o
          conjunto (selo de RLS + selos de estado + `⋯` passam de 375px) o
          bloco encolhe e dobra por dentro, alinhado à direita, em vez de
          estourar a margem e esconder o `⋯` fora da tela. */}
      <div className="ml-auto flex min-h-11 max-w-full min-w-0 flex-wrap items-center justify-end gap-2 py-1 pl-3">
        {acoes}
      </div>
    </div>
  );
}
