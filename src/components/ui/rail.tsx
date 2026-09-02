"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { control } from "@/components/ui/primitives/surface";
import { NavBadge, type NavItem } from "@/components/ui/header";
import { ChevronDownIcon } from "@/components/ui/icon";

/**
 * #512 · T08 — Menu lateral colapsável (R-24 … R-27).
 *
 * Substitui a navegação horizontal do topo por um rail lateral em desktop
 * (≥1024px). Mobile continua na `BottomNav` (já satisfaz R-27 — barra
 * inferior, não gaveta superior — desde #185); este componente não toca nela.
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
 * `localStorage`), então não há salto de hidratação.
 */
function lerColapsado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_RAIL_COLAPSADO) === "1";
  } catch {
    return false;
  }
}

function gravarColapsado(colapsado: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_RAIL_COLAPSADO, colapsado ? "1" : "0");
  } catch {
    // Sem persistir, a próxima carga volta ao default expandido. Aceitável:
    // é preferência de exibição do rail, não dado clínico.
  }
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

  const classeItemAdmin = cn(
    control("sm"),
    "font-display flex items-center rounded-[var(--radius-control)] border-2 border-transparent px-3 text-sm",
    "font-semibold text-[var(--text-secondary)]",
    "hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
    "focus-visible:outline-focus",
  );

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
        className={cn(
          control("sm"),
          "flex w-full items-center gap-2 rounded-[var(--radius-control)] border-2 border-transparent text-sm font-semibold text-[var(--text-secondary)]",
          colapsado ? "justify-center px-0" : "justify-start px-3",
          "hover:border-[var(--border-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
          "focus-visible:outline-focus",
        )}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-current/30 font-mono text-[10px] font-bold"
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
                  {renderAdminLink(item, conteudo, classeItemAdmin)}
                </React.Fragment>
              );
            }
            return (
              <a
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={classeItemAdmin}
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
  signOutSlot,
  renderLink,
  renderAdminLink,
  className,
}: RailProps) {
  // Inicializador preguiçoso, não `useEffect` + `setState` (o lint da
  // Compiler barra setState síncrono dentro de efeito — cascata de render).
  // No servidor (SSR não tem `window`) nasce expandido, igual ao default
  // seguro de `lerColapsado`; no cliente já nasce com a preferência real, sem
  // o salto de um segundo render. Custo aceito: se o operador tinha
  // colapsado, o HTML do servidor diverge por um frame do primeiro render do
  // cliente (warning de hidratação, não erro) — é preferência de exibição, não
  // dado clínico.
  const [colapsado, setColapsado] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : lerColapsado(),
  );

  const alternar = React.useCallback(() => {
    setColapsado((atual) => {
      const proximo = !atual;
      gravarColapsado(proximo);
      return proximo;
    });
  }, []);

  if (itemsNav.length === 0) return null;

  const largura = colapsado ? RAIL_LARGURA_COLAPSADA : RAIL_LARGURA_EXPANDIDA;

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
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border-2 border-current/30 font-mono text-[10px] font-bold"
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
        "hidden shrink-0 flex-col border-r-2 border-[var(--border-brutal)] bg-[var(--surface-card)] lg:flex",
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
