import * as React from "react";
import { cn } from "@/lib/cn";
import { control } from "./primitives/surface";

export type ChipVariante =
  | "success"
  | "warning"
  | "ai"
  | "info"
  | "brand"
  | "neutral"
  | "Success"
  | "Warning"
  | "AI"
  | "Info";

const stylesVariante: Record<string, string> = {
  success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  Success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  warning: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  Warning: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  ai: "bg-[var(--ai-tint)] border-[var(--ai-accent)] text-[var(--ai-deep)]",
  AI: "bg-[var(--ai-tint)] border-[var(--ai-accent)] text-[var(--ai-deep)]",
  info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  Info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  brand: "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)]",
  neutral: "bg-[var(--surface-elevated)] border-[var(--border-brutal)] text-[var(--text-primary)]",
};

const base = cn(
  "inline-flex items-center gap-2 border-2 border-[var(--border-brutal)] px-3 font-mono text-xs uppercase rounded-sm",
  control("sm"),
);

const getFundo = (variante: ChipVariante, selecionado: boolean) => {
  if (selecionado) {
    return "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)] font-semibold";
  }
  return stylesVariante[variante] ?? stylesVariante.neutral;
};

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
  variante?: ChipVariante;
}

function IconeX() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export const Chip = React.forwardRef<HTMLElement, ChipProps>(function Chip(
  { children, onSelecionar, selecionado = false, onRemover, rotuloRemover, className, variante = "neutral" },
  ref,
) {
  const removivel = typeof onRemover === "function";
  const corClasses = getFundo(variante, selecionado);

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
          // alvo de toque ≥44px TAMBÉM em largura — um toggle curto ("ABA")
          // não pode furar o piso de 44px (achado Casey da crítica /impeccable).
          "justify-center",
          corClasses,
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
      className={cn(base, corClasses, className)}
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
            "text-currentColor -mr-1 grid size-7 shrink-0 place-items-center rounded-[length:var(--radius-pill)]",
            foco,
            "hover:bg-[color:var(--ink-anchor)]/10",
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
