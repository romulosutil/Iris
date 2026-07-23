"use client";

import * as React from "react";
import { cn } from "@/lib/cn";


import { control } from "./primitives/surface";

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
  /** Tamanho do controle: sm (36px), md (44px - piso de toque), lg (48px) */
  tamanho?: "sm" | "md" | "lg";
  size?: "sm" | "md" | "lg";
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
  { className, opcoes, value, defaultValue, onValueChange, tamanho, size, ...props },
  ref,
) {
  const controlado = value !== undefined;
  const [interno, setInterno] = React.useState(
    defaultValue ?? opcoes[0]?.value,
  );
  const ativo = controlado ? value : interno;
  const resolvedTamanho = tamanho ?? size ?? "md";

  function selecionar(v: string) {
    if (!controlado) setInterno(v);
    onValueChange?.(v);
  }

  const tamanhoClasses = {
    sm: "min-h-9 min-w-9 px-3 py-1 text-xs",
    md: cn("text-sm px-4 py-2", control("sm")), // min-h-11 (44px) piso de toque
    lg: cn("text-base px-5 py-2.5", control("md")), // min-h-12 (48px)
  }[resolvedTamanho];

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
              "cursor-pointer inline-flex items-center justify-center font-medium transition-all duration-150 rounded-[var(--radius-xs)]",
              tamanhoClasses,
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

