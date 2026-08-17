"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface RadioCardOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface RadioCardsProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  opcoes: RadioCardOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  error?: boolean;
}

/**
 * RadioCards - Seleção exclusiva por Cards Interativos no Espectro Brutal.
 * Substitui controles comprimidos por cards acessíveis, com rótulos e descrições claras.
 */
export const RadioCards = React.forwardRef<HTMLDivElement, RadioCardsProps>(
  function RadioCards(
    {
      className,
      opcoes,
      value,
      defaultValue,
      onValueChange,
      name,
      error = false,
      ...props
    },
    ref,
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(
      ref,
      () => containerRef.current as HTMLDivElement,
    );

    const controlado = value !== undefined;
    const [interno, setInterno] = React.useState(defaultValue ?? "");
    const selecionado = controlado ? value : interno;

    function selecionar(v: string) {
      if (!controlado) setInterno(v);
      onValueChange?.(v);
    }

    function handleKeyDown(e: React.KeyboardEvent, index: number) {
      if (opcoes.length === 0) return;
      if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const nextIndex = (index + 1) % opcoes.length;
        const targetOption = opcoes[nextIndex];
        if (targetOption) selecionar(targetOption.value);
        const buttons =
          containerRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="radio"]',
          );
        buttons?.[nextIndex]?.focus();
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        const prevIndex = (index - 1 + opcoes.length) % opcoes.length;
        const targetOption = opcoes[prevIndex];
        if (targetOption) selecionar(targetOption.value);
        const buttons =
          containerRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="radio"]',
          );
        buttons?.[prevIndex]?.focus();
      }
    }

    return (
      <div
        ref={containerRef}
        role="radiogroup"
        className={cn(
          "grid w-full grid-cols-1 gap-3 sm:grid-cols-2",
          className,
        )}
        {...props}
      >
        {opcoes.map((opcao, index) => {
          const isSelected = opcao.value === selecionado;
          return (
            <button
              key={opcao.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selecionado && index === 0) ? 0 : -1}
              onClick={() => selecionar(opcao.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "group relative flex min-h-[60px] cursor-pointer items-start gap-3.5 rounded-[var(--radius-control)] border-2 p-4 text-left transition-all duration-150 select-none",
                "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                isSelected
                  ? "border-[var(--border-brutal)] bg-[var(--action-primary-tint,rgba(242,183,5,0.08))] font-semibold shadow-[var(--ds-shadow)]"
                  : cn(
                      "bg-[var(--surface-card)] text-[var(--text-secondary)]",
                      error
                        ? "border-[var(--status-error-fg)]"
                        : "border-[var(--border-brutal)]/30 hover:border-[var(--border-brutal)] hover:text-[var(--text-primary)] hover:shadow-sm",
                    ),
              )}
            >
              {/* Radio Circle Indicator */}
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isSelected
                    ? "border-[var(--border-brutal)] bg-[var(--action-primary)]"
                    : "border-[var(--border-brutal)]/40 bg-white group-hover:border-[var(--border-brutal)]",
                )}
              >
                {isSelected && (
                  <span className="size-2 rounded-full bg-[var(--action-primary-fg)]" />
                )}
              </span>

              {/* Text content */}
              <span className="flex flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "font-display text-sm leading-tight",
                    isSelected
                      ? "font-semibold text-[var(--text-primary)]"
                      : "font-medium text-[var(--text-primary)] group-hover:text-black",
                  )}
                >
                  {opcao.label}
                </span>
                {opcao.description && (
                  <span className="font-body mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {opcao.description}
                  </span>
                )}
              </span>

              {opcao.badge && <span className="shrink-0">{opcao.badge}</span>}
            </button>
          );
        })}
      </div>
    );
  },
);
