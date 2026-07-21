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
        "inline-flex gap-1 rounded-[7px] border-[1.5px] border-[color:var(--ink-anchor)] p-[3px]",
        "bg-[#F7F6F1] shadow-[2px_2px_0_0_var(--ink-anchor)]",
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
              "cursor-pointer px-4 py-[7px] text-sm font-medium transition-all duration-150",
              isAtivo
                ? "rounded-[var(--radius-sm)] bg-[color:var(--brand-primary)] text-[color:var(--ink-anchor)] shadow-[1px_1px_0_0_var(--ink-anchor)]"
                : "bg-transparent text-[color:var(--color-graphite)]",
            )}
          >
            {opcao.label}
          </button>
        );
      })}
    </div>
  );
});
