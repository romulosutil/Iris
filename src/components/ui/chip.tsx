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
  success: "bg-[color:var(--success-tint)] border-[color:var(--success-accent)] text-[color:var(--success-deep)]",
  Success: "bg-[color:var(--success-tint)] border-[color:var(--success-accent)] text-[color:var(--success-deep)]",
  warning: "bg-[color:var(--warning-tint)] border-[color:var(--warning-accent)] text-[color:var(--warning-deep)]",
  Warning: "bg-[color:var(--warning-tint)] border-[color:var(--warning-accent)] text-[color:var(--warning-deep)]",
  ai: "bg-[color:var(--ai-tint)] border-[color:var(--ai-accent)] text-[color:var(--ai-deep)]",
  AI: "bg-[color:var(--ai-tint)] border-[color:var(--ai-accent)] text-[color:var(--ai-deep)]",
  info: "bg-[color:var(--info-tint)] border-[color:var(--info-accent)] text-[color:var(--info-deep)]",
  Info: "bg-[color:var(--info-tint)] border-[color:var(--info-accent)] text-[color:var(--info-deep)]",
  brand: "bg-[color:var(--brand-tint)] border-[color:var(--brand-primary)] text-[color:var(--ink-anchor)]",
  neutral: "bg-[color:var(--color-raw-gray-50)] border-[color:var(--color-raw-gray-800)] text-[color:var(--color-raw-gray-900)]",
};

/**
 * Chip: tag de protocolo/família ou filtro selecionável na fila do coordenador.
 * Mesma linguagem do Button (borda âncora, canto redondo/pílula, foco ortogonal).
 * Alvo de toque ≥44px no Modo Clínico via min-h-11.
 */
const base = cn(
  "inline-flex items-center gap-2 border-[length:var(--border-brutal)] px-3 font-body text-sm rounded-full",
  control("sm"),
);

const getFundo = (variante: ChipVariante, selecionado: boolean) => {
  if (selecionado) {
    // Destaque brand-primary se selecionado
    return "bg-[color:var(--brand-primary)] border-[color:var(--ink-anchor)] text-[color:var(--ink-anchor)] font-semibold";
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
            "text-currentColor -mr-1 grid size-7 shrink-0 place-items-center rounded-full",
            foco,
            "hover:bg-black/10",
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
