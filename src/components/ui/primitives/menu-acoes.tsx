"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/cn";
import { MoreHorizontalIcon } from "@/components/ui/icon";

export interface MenuAcaoItem {
  /** Chave estável do item. */
  id: string;
  /** Rótulo lido pelo leitor de tela e exibido no menu. */
  rotulo: string;
  /** Executado ao selecionar (clique, Enter ou Espaço). O menu fecha antes. */
  aoSelecionar: () => void;
  /** Ícone opcional à esquerda do rótulo. */
  icone?: React.ReactNode;
  desabilitado?: boolean;
  /** `destrutivo` pinta o item com a cor de erro do tema. */
  tom?: "neutro" | "destrutivo";
}

export interface MenuAcoesProps {
  itens: MenuAcaoItem[];
  /** Rótulo acessível do gatilho de reticências. */
  rotulo?: string;
  /** Lado do card em que o painel se alinha. */
  alinhamento?: "inicio" | "fim";
  className?: string;
}

/**
 * MenuAcoes — menu suspenso de reticências para ações secundárias de um card.
 *
 * Segue o padrão WAI-ARIA de menu button: o gatilho declara
 * `aria-haspopup="menu"` + `aria-expanded`, o painel é um `role="menu"` com
 * `role="menuitem"`, e a navegação usa tabindex móvel (só o item ativo é
 * focável). Setas percorrem em ciclo, Home/End vão às pontas, Escape e Tab
 * fecham devolvendo o foco ao gatilho — nenhuma ação fica presa ao ponteiro.
 */
export function MenuAcoes({
  itens,
  rotulo = "Mais ações",
  alinhamento = "fim",
  className,
}: MenuAcoesProps) {
  const [aberto, setAberto] = React.useState(false);
  const [indiceAtivo, setIndiceAtivo] = React.useState(0);
  const menuId = React.useId();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gatilhoRef = React.useRef<HTMLButtonElement | null>(null);
  const itensRef = React.useRef<Array<HTMLButtonElement | null>>([]);

  const fechar = React.useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  }, []);

  const abrir = React.useCallback((indiceInicial: number) => {
    setIndiceAtivo(indiceInicial);
    setAberto(true);
  }, []);

  // Foco segue o item ativo enquanto o menu está aberto.
  React.useEffect(() => {
    if (!aberto) return;
    itensRef.current[indiceAtivo]?.focus();
  }, [aberto, indiceAtivo]);

  // Clique fora fecha sem roubar o foco de onde o usuário clicou.
  React.useEffect(() => {
    if (!aberto) return;
    function aoApontar(evento: PointerEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("pointerdown", aoApontar);
    return () => document.removeEventListener("pointerdown", aoApontar);
  }, [aberto]);

  function primeiroHabilitado(): number {
    const indice = itens.findIndex((item) => !item.desabilitado);
    return indice === -1 ? 0 : indice;
  }

  function ultimoHabilitado(): number {
    for (let i = itens.length - 1; i >= 0; i -= 1) {
      if (!itens[i]?.desabilitado) return i;
    }
    return 0;
  }

  function proximoHabilitado(inicio: number, passo: number): number {
    const total = itens.length;
    if (total === 0) return 0;
    for (let salto = 1; salto <= total; salto += 1) {
      const candidato = (((inicio + passo * salto) % total) + total) % total;
      if (!itens[candidato]?.desabilitado) return candidato;
    }
    return inicio;
  }

  function aoTeclarGatilho(evento: React.KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      abrir(primeiroHabilitado());
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      abrir(ultimoHabilitado());
    }
  }

  function aoTeclarMenu(evento: React.KeyboardEvent<HTMLDivElement>) {
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        setIndiceAtivo((atual) => proximoHabilitado(atual, 1));
        break;
      case "ArrowUp":
        evento.preventDefault();
        setIndiceAtivo((atual) => proximoHabilitado(atual, -1));
        break;
      case "Home":
        evento.preventDefault();
        setIndiceAtivo(primeiroHabilitado());
        break;
      case "End":
        evento.preventDefault();
        setIndiceAtivo(ultimoHabilitado());
        break;
      case "Escape":
        evento.preventDefault();
        evento.stopPropagation();
        fechar();
        break;
      case "Tab":
        // Tab sai do menu: fecha e deixa o navegador seguir a ordem natural.
        fechar(false);
        break;
      default:
        break;
    }
  }

  function selecionar(item: MenuAcaoItem) {
    if (item.desabilitado) return;
    // `flushSync` é deliberado, não zelo: sem ele o fechamento seria só mais um
    // estado no mesmo lote do handler, e a ação (tipicamente abrir um Dialog)
    // rodaria com o foco ainda no `menuitem`. O Radix guarda como "foco
    // anterior" o elemento ativo no momento em que o modal abre — e devolveria
    // o foco a um nó já desmontado ao fechar, deixando quem navega por teclado
    // no vazio. Fechando e devolvendo o foco ao gatilho ANTES, o modal volta
    // para o botão de reticências, que continua na árvore.
    flushSync(() => {
      fechar();
    });
    item.aoSelecionar();
  }

  if (itens.length === 0) return null;

  return (
    <div ref={containerRef} className={cn("relative inline-flex", className)}>
      <button
        ref={gatilhoRef}
        type="button"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        onClick={() => (aberto ? fechar() : abrir(primeiroHabilitado()))}
        onKeyDown={aoTeclarGatilho}
        className={cn(
          "focus-visible:outline-focus inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-transparent text-[var(--text-secondary)] transition-colors",
          "hover:border-[var(--border-brutal)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
          aberto &&
            "border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-primary)]",
        )}
      >
        <MoreHorizontalIcon size={18} aria-hidden focusable="false" />
      </button>

      {aberto ? (
        <div
          id={menuId}
          role="menu"
          aria-label={rotulo}
          onKeyDown={aoTeclarMenu}
          className={cn(
            "absolute top-full z-40 mt-1 flex min-w-[13rem] flex-col rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-1 shadow-[var(--ds-shadow)]",
            alinhamento === "fim" ? "right-0" : "left-0",
          )}
        >
          {itens.map((item, indice) => (
            <button
              key={item.id}
              ref={(nodo) => {
                itensRef.current[indice] = nodo;
              }}
              type="button"
              role="menuitem"
              tabIndex={indice === indiceAtivo ? 0 : -1}
              disabled={item.desabilitado}
              onClick={() => selecionar(item)}
              onMouseEnter={() => {
                if (!item.desabilitado) setIndiceAtivo(indice);
              }}
              className={cn(
                "focus-visible:outline-focus flex min-h-[40px] w-full items-center gap-2 rounded-[var(--radius-xs)] px-3 py-2 text-left text-sm transition-colors",
                item.tom === "destrutivo"
                  ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]/25"
                  : "text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
              )}
            >
              {item.icone ? (
                <span className="inline-flex shrink-0 items-center" aria-hidden>
                  {item.icone}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">{item.rotulo}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
