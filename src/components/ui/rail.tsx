"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { control } from "@/components/ui/primitives/surface";
import { NavBadge, type NavItem } from "@/components/ui/header";
import { ChevronDownIcon } from "@/components/ui/icon";

/**
 * #512 · T08 — Menu lateral colapsável (R-24 … R-27).
 *
 * É a ÚNICA navegação de desktop (≥1024px): a faixa horizontal do topo, que
 * antes duplicava estes mesmos destinos (e o mesmo landmark
 * `Navegação principal`), não existe mais. Abaixo de `lg` quem navega é a
 * `BottomNav` + o Drawer do `Header` (R-27 — barra inferior, não gaveta
 * superior, desde #185); este componente não toca neles.
 *
 * O rail é `position: fixed` e mede `h-dvh`: a altura é a do DISPOSITIVO, não
 * a da página. Antes ele era um filho `flex` de uma coluna `min-h-dvh` e
 * esticava junto com o conteúdo — numa lista longa de pacientes, os itens de
 * navegação subiam para fora da tela junto com o scroll da página, e o rodapé
 * (menu do usuário + `Sair`) só reaparecia no fim do documento. Quem desloca
 * o conteúdo para o lado do rail é `AppHeader`, com o `padding-left` derivado
 * de `larguraRail` — por isso o estado colapsado mora em `useRailColapsado`,
 * fora deste componente, quando há alguém interessado nele.
 */

export const CHAVE_RAIL_COLAPSADO = "iris_rail_colapsado";
/** R-25 — 236px expandido ↔ 68px colapsado. */
export const RAIL_LARGURA_EXPANDIDA = 236;
export const RAIL_LARGURA_COLAPSADA = 68;

/**
 * R-25 — a leitura de `localStorage` ESTOURA em janela anônima/privada (ex.:
 * Safari com "Impedir Rastreamento entre Sites" em alguns modos). O `try/catch`
 * não é defesa cosmética: sem ele, o rail inteiro quebra a renderização do
 * shell do app para quem abre o produto numa aba anônima. O default seguro é
 * SEMPRE expandido — é o mesmo estado que o servidor "renderiza" (SSR não tem
 * `localStorage`).
 */
function lerColapsado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_RAIL_COLAPSADO) === "1";
  } catch {
    return false;
  }
}

const railListeners = new Set<() => void>();

/**
 * Cache em memória do valor corrente — não é só otimização. R-25: quando
 * `setItem` lança (quota, modo anônimo), a UI ainda precisa alternar dentro
 * da MESMA aba (só não sobrevive a um reload). Se o snapshot lesse
 * `localStorage` direto, uma gravação falha faria `useSyncExternalStore`
 * recalcular o MESMO valor antigo — `Object.is` não vê mudança e o rail trava
 * visualmente, mesmo o clique tendo "funcionado". `valorAtual` é a fonte de
 * verdade da aba; `storage` (evento de OUTRA aba) é quem a invalida.
 */
let valorAtual: boolean | null = null;

function notificarRailListeners(): void {
  railListeners.forEach((listener) => listener());
}

function gravarColapsado(colapsado: boolean): void {
  valorAtual = colapsado;
  try {
    window.localStorage.setItem(CHAVE_RAIL_COLAPSADO, colapsado ? "1" : "0");
  } catch {
    // Sem persistir, a próxima carga volta ao default expandido. Aceitável:
    // é preferência de exibição do rail, não dado clínico. O estado em
    // memória (`valorAtual`) já mudou — a aba atual não trava.
  }
  notificarRailListeners();
}

function inscreverRail(listener: () => void): () => void {
  railListeners.add(listener);
  const aoMudarStorage = (evento: StorageEvent) => {
    if (evento.key === CHAVE_RAIL_COLAPSADO || evento.key === null) {
      valorAtual = lerColapsado();
    }
    listener();
  };
  window.addEventListener("storage", aoMudarStorage);
  return () => {
    railListeners.delete(listener);
    window.removeEventListener("storage", aoMudarStorage);
  };
}

function obterSnapshotRail(): boolean {
  if (valorAtual === null) {
    valorAtual = lerColapsado();
  }
  return valorAtual;
}

function obterSnapshotServidorRail(): boolean {
  return false;
}

/** Só para teste: `valorAtual` é cache de módulo, sobrevive entre `it()` do
 * mesmo arquivo — sem isto, o valor otimista de um teste vaza pro próximo. */
export function _resetRailParaTeste(): void {
  valorAtual = null;
}

/** Largura em px do rail no estado dado — fonte única para o próprio rail e
 * para o `padding-left` do conteúdo em `AppHeader`. Com o rail `fixed`, os
 * dois números precisam vir do mesmo lugar: se divergirem, ou sobra uma
 * faixa vazia, ou o rail come a primeira coluna do conteúdo. */
export function larguraRail(colapsado: boolean): number {
  return colapsado ? RAIL_LARGURA_COLAPSADA : RAIL_LARGURA_EXPANDIDA;
}

/**
 * Estado colapsado do rail + persistência.
 *
 * `useSyncExternalStore`, não `useState` com inicializador preguiçoso lendo
 * `localStorage`: o inicializador rodava só no cliente, então o snapshot do
 * servidor (`false`) e o primeiro snapshot do cliente (preferência real)
 * podiam divergir — hydration mismatch descartado de propósito, o que o
 * `useSyncExternalStore` resolve por contrato (React usa o snapshot do
 * servidor na hidratação e só troca depois, sem warning). `alternar` lê o
 * valor corrente do próprio store (não do closure) para não perder toggles
 * em sequência.
 */
export function useRailColapsado(): {
  colapsado: boolean;
  alternar: () => void;
} {
  const colapsado = React.useSyncExternalStore(
    inscreverRail,
    obterSnapshotRail,
    obterSnapshotServidorRail,
  );

  const alternar = React.useCallback(() => {
    gravarColapsado(!obterSnapshotRail());
  }, []);

  return { colapsado, alternar };
}

const IGNORAR_NO_MONOGRAMA = new Set(["de", "da", "do", "e", "a", "o"]);

/**
 * Marca decorativa de 1-2 letras para o estado colapsado. NUNCA é o portador
 * de significado (R-26) — só o `aria-label`/`title` do link são; isto é só o
 * `aria-hidden` visual que substitui o rótulo por texto truncado.
 */
function monograma(label: string): string {
  const palavras = label
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !IGNORAR_NO_MONOGRAMA.has(p.toLowerCase()));
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0]!.slice(0, 2).toUpperCase();
  return (palavras[0]![0]! + palavras[1]![0]!).toUpperCase();
}

export interface RailProps {
  itemsNav: NavItem[];
  /** Estado colapsado CONTROLADO. Quando ausente, o rail governa o próprio
   * estado (e persiste em `localStorage`) — é o modo usado nos testes de
   * componente e no Storybook. `AppHeader` controla de fora porque precisa da
   * mesma largura para deslocar o conteúdo (`larguraRail`). */
  colapsado?: boolean;
  /** Par de `colapsado`. Só é lido quando `colapsado` é fornecido. */
  onAlternar?: () => void;
  /** #512 · T09 (R-22) — administração da clínica (`Dados da Clínica`,
   * `Exportar Acervo`, `Equipe`, `Assinatura`, `Dúvidas`, `Meu Perfil`), fora
   * do menu diário. Vive atrás de um gatilho no rodapé — são itens de baixa
   * frequência (~1x/trimestre) que não podem competir por espaço com os de
   * uso diário. */
  itemsAdmin?: NavItem[];
  signOutSlot?: React.ReactNode;
  renderLink?: (
    item: NavItem,
    children: React.ReactNode,
    className: string,
  ) => React.ReactNode;
  /** Renderer dos itens de `itemsAdmin` — mesmo contrato de `renderLink`,
   * separado porque o card produzido (menu do usuário) não reaproveita a
   * classe visual do link de nav diária. */
  renderAdminLink?: (
    item: NavItem,
    children: React.ReactNode,
    className: string,
  ) => React.ReactNode;
  className?: string;
}

/**
 * #512 · T09 (R-22) — menu do usuário no rodapé do rail: um disclosure
 * simples (botão + painel condicional), não um `role="menu"` completo com
 * roving tabindex — os itens SÃO links de navegação de verdade (cada um
 * navegável, indexável, abrível em nova aba), e forçar semântica de menu
 * button sobre links é o antipadrão que o WAI-ARIA Authoring Practices
 * desaconselha (menuitem não é destino de navegação). Fecha em Escape e em
 * clique fora, devolvendo o foco ao gatilho — mesmo padrão de fechamento do
 * `MenuAcoes` (`primitives/menu-acoes.tsx`), sem duplicar a navegação por
 * setas que aquele componente resolve para AÇÕES, não para links.
 */
function MenuUsuario({
  itemsAdmin,
  colapsado,
  renderAdminLink,
}: {
  itemsAdmin: NavItem[];
  colapsado: boolean;
  renderAdminLink?: RailProps["renderAdminLink"];
}) {
  const [aberto, setAberto] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gatilhoRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    function aoApontar(evento: PointerEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", aoApontar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoApontar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  if (itemsAdmin.length === 0) return null;

  // #533 (revisão pós-PR) — o item de administração acende pela MESMA régua
  // do item da nav diária. Sem isto, `itemsAdmin` recebia `active` calculado
  // em `app-header.tsx`, exportava `aria-current` pelo `renderAdminLink` e
  // jogava fora o sinal visual: em `/alertas-risco` o leitor de tela sabia
  // onde estava e o olho não.
  const classeItemAdmin = (item: NavItem) =>
    cn(
      control("sm"),
      "font-display flex items-center rounded-[var(--radius-control)] border-2 px-3 text-sm",
      "focus-visible:outline-focus",
      item.active
        ? "border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)] shadow-[var(--elevation-1)]"
        : "border-transparent font-semibold text-[var(--text-secondary)] hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
    );

  // Popover fechado é o estado normal do rail: se a rota atual mora dentro da
  // Administração, o gatilho é o único âncora visível — sem ele o desktop
  // fica sem NENHUM item aceso em `/validacao`, `/alertas-risco`, `/equipe`…
  const algumAdminAtivo = itemsAdmin.some((item) => item.active);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={gatilhoRef}
        type="button"
        aria-label="Menu do usuário — Administração"
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        title="Menu do usuário — Administração"
        data-secao-ativa={algumAdminAtivo ? "true" : undefined}
        className={cn(
          control("sm"),
          "flex w-full items-center gap-2 rounded-[var(--radius-control)] border-2 text-sm",
          colapsado ? "justify-center px-0" : "justify-start px-3",
          "focus-visible:outline-focus",
          algumAdminAtivo
            ? "border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)] shadow-[var(--elevation-1)]"
            : "border-transparent font-semibold text-[var(--text-secondary)] hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
        )}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-current/30 font-mono text-xs font-bold"
        >
          AD
        </span>
        {!colapsado ? <span className="truncate">Administração</span> : null}
      </button>

      {aberto ? (
        <div className="absolute bottom-full left-0 z-40 mb-1 flex min-w-[13rem] flex-col gap-1 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-1 shadow-[var(--ds-shadow)]">
          {itemsAdmin.map((item) => {
            // #533 — Validação e Alertas de risco moram aqui com badge; sem
            // isto o número que a nav promete ficaria só no menu diário.
            const conteudo = (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <NavBadge valor={item.badge} tom={item.badgeTom} />
                ) : null}
              </span>
            );
            if (renderAdminLink) {
              return (
                <React.Fragment key={item.href}>
                  {renderAdminLink(item, conteudo, classeItemAdmin(item))}
                </React.Fragment>
              );
            }
            return (
              <a
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={item.active ? "page" : undefined}
                className={classeItemAdmin(item)}
              >
                {conteudo}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Rail({
  itemsNav,
  itemsAdmin = [],
  colapsado: colapsadoProp,
  onAlternar,
  signOutSlot,
  renderLink,
  renderAdminLink,
  className,
}: RailProps) {
  // O hook roda SEMPRE (regra dos Hooks), mesmo controlado de fora: o custo é
  // uma leitura de `localStorage` no mount, e a alternativa — chamar o hook
  // condicionalmente — é o bug clássico de ordem de hooks.
  const interno = useRailColapsado();
  const colapsado = colapsadoProp ?? interno.colapsado;
  const alternar = onAlternar ?? interno.alternar;

  if (itemsNav.length === 0) return null;

  const largura = larguraRail(colapsado);

  const linkClasse = (item: NavItem) =>
    cn(
      control("sm"), // R-26 — piso de toque 44px, colapsado ou não.
      "font-display flex items-center gap-3 rounded-[var(--radius-control)] border-2 px-3 text-sm",
      "transition-[background-color,border-color,box-shadow] duration-100 ease-out",
      "focus-visible:outline-focus",
      colapsado ? "justify-center px-0" : "justify-start",
      item.active
        ? "border-[var(--border-brutal)] bg-[var(--brand-tint)] font-bold text-[var(--text-primary)] shadow-[var(--elevation-1)]"
        : "border-transparent font-semibold text-[var(--text-secondary)] hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
    );

  const conteudoItem = (item: NavItem) => (
    <>
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border-2 border-current/30 font-mono text-xs font-bold"
        >
          {monograma(item.label)}
        </span>
        {/* R-26 — colapsado, o badge migra para cima do monograma: continua
            visível, nunca só o ícone carrega a pendência. */}
        {colapsado && item.badge !== undefined && item.badge > 0 ? (
          <span className="absolute -top-1.5 -right-1.5">
            <NavBadge valor={item.badge} tom={item.badgeTom} />
          </span>
        ) : null}
      </span>
      {!colapsado ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 ? (
            <NavBadge valor={item.badge} tom={item.badgeTom} />
          ) : null}
        </span>
      ) : null}
    </>
  );

  const link = (item: NavItem) => {
    const conteudo = conteudoItem(item);
    const classe = linkClasse(item);
    if (renderLink) return renderLink(item, conteudo, classe);
    // Default isolado (usado nos testes de componente e onde não há um
    // `renderLink` de domínio): precisa carregar `aria-label`/`title` por
    // conta própria, porque colapsado o texto visível já não é mais o
    // rótulo completo (R-26).
    return (
      <a
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={item.active ? "page" : undefined}
        title={item.label}
        className={classe}
      >
        {conteudo}
      </a>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        // `fixed` + `h-dvh`: a altura é a do dispositivo. `z-30` fica ABAIXO
        // do overlay de Dialog/Drawer (`z-40`) e do painel deles (`z-50`) —
        // um rail que pintasse por cima de um modal seria clicável com o
        // modal aberto.
        "fixed top-0 left-0 z-30 hidden h-dvh flex-col border-r-2 border-[var(--border-brutal)] bg-[var(--surface-card)] lg:flex",
        "transition-[width] duration-150 ease-out",
        className,
      )}
      style={{ width: largura }}
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--border-brutal)]/15 p-2",
          colapsado ? "justify-center" : "justify-end",
        )}
      >
        <button
          type="button"
          onClick={alternar}
          aria-label={colapsado ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!colapsado}
          title={colapsado ? "Expandir menu" : "Recolher menu"}
          className={cn(
            control("sm"),
            "flex items-center justify-center rounded-[var(--radius-control)] border-2 border-transparent text-[var(--text-secondary)]",
            "hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
            "focus-visible:outline-focus",
          )}
        >
          <ChevronDownIcon
            size={16}
            aria-hidden
            className={cn(
              "transition-transform duration-150",
              colapsado ? "-rotate-90" : "rotate-90",
            )}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {itemsNav.map((item) => (
          <React.Fragment key={item.href}>{link(item)}</React.Fragment>
        ))}
      </div>

      {itemsAdmin.length > 0 || signOutSlot ? (
        <div
          className={cn(
            "flex flex-col gap-1 border-t border-[var(--border-brutal)]/15 p-2",
            colapsado ? "items-center" : "items-stretch",
          )}
        >
          {itemsAdmin.length > 0 ? (
            <MenuUsuario
              itemsAdmin={itemsAdmin}
              colapsado={colapsado}
              renderAdminLink={renderAdminLink}
            />
          ) : null}
          {signOutSlot}
        </div>
      ) : null}
    </nav>
  );
}
