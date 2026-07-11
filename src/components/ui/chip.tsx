import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Chip: tag de protocolo/família ou filtro selecionável na fila do coordenador.
 * Mesma linguagem do Button (borda âncora, canto vivo, foco ortogonal). Três
 * usos a partir das props:
 *  - estático (só `children`): um <span> rotulador.
 *  - selecionável (`onSelecionar`): vira <button aria-pressed> (filtro/toggle).
 *  - removível (`onRemover`): ganha um botão × dedicado.
 * Alvo de toque ≥44px no Modo Clínico via min-h-11.
 */
const base =
  "inline-flex min-h-11 items-center gap-2 border-ink-anchor border-2 px-3 font-body text-sm";

const fundo = (selecionado: boolean) =>
  selecionado ? "bg-gold text-ink-anchor font-semibold" : "bg-surface text-ink";

const foco =
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";

export interface ChipProps {
  children: React.ReactNode;
  /** Se definido, o chip é um toggle (filtro) e reflete `selecionado`. */
  onSelecionar?: () => void;
  selecionado?: boolean;
  /** Se definido, mostra um botão × que remove o chip. */
  onRemover?: () => void;
  /** Rótulo acessível para o botão remover (ex.: "Remover ABA"). */
  rotuloRemover?: string;
  className?: string;
}

function IconeX() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export const Chip = React.forwardRef<HTMLElement, ChipProps>(function Chip(
  { children, onSelecionar, selecionado = false, onRemover, rotuloRemover, className },
  ref,
) {
  const removivel = typeof onRemover === "function";

  // Toggle puro: o próprio chip é o botão (sem remover).
  if (onSelecionar && !removivel) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        aria-pressed={selecionado}
        onClick={onSelecionar}
        className={cn(
          base,
          fundo(selecionado),
          foco,
          "transition-transform duration-100 ease-out hover:-translate-x-px hover:-translate-y-px",
          "active:translate-x-0 active:translate-y-0",
          className,
        )}
      >
        {children}
      </button>
    );
  }

  // Container (estático ou removível). Toggle + remover convivem: rótulo vira
  // um botão interno para não aninhar <button> dentro de <button>.
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(base, fundo(selecionado), className)}
    >
      {onSelecionar ? (
        <button
          type="button"
          aria-pressed={selecionado}
          onClick={onSelecionar}
          className={cn("-mx-1 px-1", foco)}
        >
          {children}
        </button>
      ) : (
        children
      )}
      {removivel ? (
        <button
          type="button"
          onClick={onRemover}
          aria-label={rotuloRemover ?? "Remover"}
          className={cn(
            "text-ink-anchor -mr-1 grid size-7 shrink-0 place-items-center",
            foco,
            "hover:bg-ink-anchor/10",
          )}
        >
          <IconeX />
        </button>
      ) : null}
    </span>
  );
});

export interface ChipGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rótulo do grupo para leitores de tela (ex.: "Filtrar por protocolo"). */
  rotulo: string;
}

export const ChipGroup = React.forwardRef<HTMLDivElement, ChipGroupProps>(
  function ChipGroup({ className, rotulo, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        role="group"
        aria-label={rotulo}
        className={cn("flex flex-wrap items-center gap-2", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
