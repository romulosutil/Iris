"use client";

import * as React from "react";
import { cn } from "@/lib/cn";


export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

export interface SegmentedControlProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  opcoes: SegmentedOption[];
  /** Valor controlado. Se omitido, o componente gerencia estado interno. */
  value?: string;
  /** Valor inicial no modo não-controlado. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Controle segmentado (toggle de opções mutuamente exclusivas). Superfície
 * off-white com borda âncora + sombra dura; o item ativo ganha fundo de
 * marca, sombra própria e transição suave.
 */
export const SegmentedControl = React.forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>(function SegmentedControl(
  { className, opcoes, value, defaultValue, onValueChange, ...props },
  ref,
) {
  const controlado = value !== undefined;
  const [interno, setInterno] = React.useState(
    defaultValue ?? opcoes[0]?.value,
  );
  const ativo = controlado ? value : interno;

  function selecionar(v: string) {
    if (!controlado) setInterno(v);
    onValueChange?.(v);
  }

  return (
    <div
      ref={ref}
      role="group"
      className={cn(
        "inline-flex max-w-full overflow-x-auto gap-1 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] p-1",
        "bg-[var(--surface-card)] shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      {opcoes.map((opcao) => {
        const isAtivo = opcao.value === ativo;
        return (
          <button
            key={opcao.value}
            type="button"
            aria-pressed={isAtivo}
            onClick={() => selecionar(opcao.value)}
            className={cn(
              "cursor-pointer min-h-9 px-4 py-1.5 text-sm font-medium transition-all duration-150 rounded-[var(--radius-xs)]",
              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
              isAtivo
                ? "bg-[var(--action-primary)] text-[var(--action-primary-fg)] font-bold"
                : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {opcao.label}
          </button>
        );
      })}
    </div>
  );
});
