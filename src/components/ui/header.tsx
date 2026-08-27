"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Cluster, Container } from "@/components/ui/layout";
import type { ContainerProps } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { control } from "@/components/ui/primitives/surface";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { BottomNav } from "@/components/ui/bottom-nav";

/**
 * Tom da contagem ao lado do rótulo. A cor NUNCA carrega o significado sozinha
 * (o número é texto e o destino do link nomeia a fila); ela só evita que toda
 * pendência do produto grite no mesmo volume:
 *
 * - `neutro`  — fila operacional: "há itens aqui", nunca "isto é um problema".
 * - `ia`      — fila gerada por extração da IA, pendente de olhar clínico.
 * - `risco`   — alerta de risco. Único tom que pode usar vermelho.
 */
export type NavBadgeTom = "neutro" | "ia" | "risco";

export interface NavItem {
  href: string;
  label: string;
  /**
   * Rótulo abreviado para a Bottom Navigation Bar (#185). Cada slot tem ~68px
   * em 360px de viewport; "Central de Validação" não cabe. Quando ausente, a
   * `BottomNav` cai no `label`. O `aria-label` do link continua sendo o `label`
   * completo — quem usa leitor de tela não perde a palavra "Central".
   */
  labelCurto?: string;
  badge?: number;
  badgeTom?: NavBadgeTom;
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

const badgeTomClasse: Record<NavBadgeTom, string> = {
  neutro:
    "border-[var(--surface-muted-border)] bg-[var(--surface-muted)] text-[var(--text-primary)]",
  ia: "border-[var(--status-ia-border)] bg-[var(--status-ia-bg)] text-[var(--status-ia-fg)]",
  risco:
    "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
};

function NavBadge({
  valor,
  tom = "neutro",
}: {
  valor: number;
  tom?: NavBadgeTom;
}) {
  return (
    <span
      className={cn(
        "rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-xs font-bold",
        badgeTomClasse[tom],
      )}
    >
      {valor}
    </span>
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

    /**
     * Estado ativo lido pelo eixo de profundidade epistêmica: a rota atual é
     * fato consolidado, então ela PREENCHE, ganha borda contínua e LEVANTA da
     * superfície. As demais ficam rentes. O `aria-current="page"` continua
     * sendo o sinal redundante — a cor nunca decide sozinha.
     */
    const getItemClassName = (item: NavItem) =>
      cn(
        control("sm"),
        "font-display inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 px-3.5 text-sm",
        "transition-[background-color,border-color,box-shadow,transform] duration-100 ease-out",
        item.active
          ? "border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)] shadow-[var(--elevation-1)]"
          : "border-transparent font-semibold text-[var(--text-secondary)] hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
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

    const rotuloComBadge = (item: NavItem) => (
      <>
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 ? (
          <NavBadge valor={item.badge} tom={item.badgeTom} />
        ) : null}
      </>
    );

    /**
     * O Drawer sai de dentro da faixa de identidade (#185). Antes ele estava
     * acoplado ao botão hambúrguer via `DrawerTrigger`; agora o gatilho é a
     * `BottomNav`, que fica `fixed` no rodapé. Como o `Drawer` já é controlado
     * por `open`/`onOpenChange`, basta chamar `setDrawerOpen(true)` — não é
     * preciso um segundo `DrawerTrigger`.
     */
    const drawerNavegacao = (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
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

            <nav aria-label="Navegação mobile" className="flex flex-col gap-2">
              {itemsNav.map((item) => {
                const content = (
                  <span className="flex w-full items-center justify-between">
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 ? (
                      <NavBadge valor={item.badge} tom={item.badgeTom} />
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
            {usuarioNome ? (
              <p className="font-body mb-2 text-sm font-semibold text-[var(--text-secondary)]">
                {usuarioNome}
              </p>
            ) : null}
            {signOutSlot ? (
              signOutSlot
            ) : onSignOut ? (
              <Button variante="terciaria" tamanho="sm" onClick={onSignOut}>
                Sair da conta
              </Button>
            ) : null}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );

    return (
      <>
        <header
          ref={ref}
          className={cn(
            "sticky top-0 z-40 border-b-2 border-[var(--border-brutal)] bg-[var(--surface-card)]/95 shadow-[var(--ds-shadow)] backdrop-blur-md",
            className,
          )}
          {...props}
        >
          {/*
          Faixa 1 — identidade: de onde eu falo (marca + clínica ativa) e quem
          eu sou (usuário + sair). Separada da navegação porque as duas colunas
          brigavam pela mesma linha: com 7 destinos, o `flex-wrap` do cluster
          empurrava "Sair" e o nome da clínica para uma segunda linha órfã,
          desalinhando a marca do conteúdo da página.
        */}
          <div className="border-b border-[var(--border-brutal)]/15">
            <Container largura={largura}>
              <div className="flex min-h-[60px] items-center justify-between gap-3 py-2 sm:min-h-[52px] sm:py-1">
                <Cluster gap="sm" className="min-w-0 flex-nowrap">
                  <Link
                    href="/"
                    aria-label="Iris — Início"
                    className={cn(
                      control("sm"),
                      "focus-visible:outline-focus flex shrink-0 items-center",
                    )}
                  >
                    <Logo variante="completo" altura={32} />
                  </Link>

                  {/* Clínica ativa (Desktop) */}
                  <div className="hidden min-w-0 items-center gap-2 sm:flex">
                    <span
                      aria-hidden
                      className="h-5 w-px shrink-0 bg-[var(--border-brutal)]/20"
                    />
                    <span className="font-display truncate text-sm font-bold text-[var(--text-primary)]">
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
                </Cluster>

                {/* Conta (Desktop) */}
                <div className="hidden shrink-0 items-center gap-3 sm:flex">
                  {usuarioNome ? (
                    <span className="font-body max-w-[18ch] truncate text-sm font-semibold text-[var(--text-secondary)]">
                      {usuarioNome}
                    </span>
                  ) : null}
                  {signOutSlot ??
                    (onSignOut ? (
                      <Button
                        variante="neutra"
                        tamanho="sm"
                        onClick={onSignOut}
                      >
                        Sair
                      </Button>
                    ) : null)}
                </div>
              </div>
            </Container>
          </div>

          {/*
          Faixa 2 — navegação (≥ 640px). Linha própria: os 7 destinos do
          coordenador cabem inteiros na largura do container, sem competir com
          marca e conta. Densidade alta é requisito do perfil (doc §2.2), então
          nada é escondido em "Mais".
        */}
          {itemsNav.length > 0 ? (
            <div className="hidden bg-[var(--surface-card)] sm:block">
              <Container largura={largura}>
                <Cluster
                  como="nav"
                  gap="xs"
                  aria-label="Navegação principal"
                  className="-mx-1.5 px-1.5 py-1"
                >
                  {itemsNav.map((item) =>
                    linkRenderer(item, rotuloComBadge(item)),
                  )}
                </Cluster>
              </Container>
            </div>
          ) : null}
        </header>

        {/*
          `BottomNav` fica FORA do `<header>` de propósito (#185): o header
          tem `backdrop-blur-md` (`backdrop-filter`), que cria um containing
          block para descendentes `position: fixed` — a barra pinaria no
          rodapé do header (que é `sticky top-0`) em vez do rodapé do
          viewport. Medido, não presumido: sem este split, o topo da barra
          ficava a ~3px do topo da tela.
        */}
        {itemsNav.length > 0 ? (
          <>
            {drawerNavegacao}
            <BottomNav
              items={itemsNav}
              onAbrirMenu={() => setDrawerOpen(true)}
              renderLink={renderLink}
            />
          </>
        ) : null}
      </>
    );
  },
);
