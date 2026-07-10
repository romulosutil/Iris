import * as React from "react";
import { cn } from "@/lib/cn";

type Risco = "baixo" | "alto";
type Variante = "primaria" | "neutra";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /**
   * Peso do deslocamento no clique escala com o risco da ação (princípio 2:
   * "fricção é ferramenta"). Aprovação em lote = baixo; decisão unitária = alto.
   */
  risco?: Risco;
}

const variantes: Record<Variante, string> = {
  primaria: "bg-gold text-ink-anchor",
  neutra: "bg-surface text-ink",
};

// Deslocamento no press: curto (risco baixo) vs longo (risco alto).
const desloca: Record<Risco, string> = {
  baixo: "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  alto: "active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variante = "primaria", risco = "baixo", type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          // base neobrutalista: borda âncora + sombra dura sem blur
          "inline-flex min-h-11 min-w-11 items-center justify-center px-5 py-2.5",
          "font-display text-base font-semibold",
          "border-ink-anchor border-2 shadow-[var(--ds-shadow)]",
          "transition-[transform,box-shadow] duration-100 ease-out",
          // hover: afordância distinta do press — aproxima 1px (abre folga na sombra)
          "hover:-translate-x-px hover:-translate-y-px",
          // anel de foco ortogonal — independente de hover/active, largura por token
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          // desabilitado: sem sombra, sem interação
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "disabled:active:translate-x-0 disabled:active:translate-y-0",
          variantes[variante],
          desloca[risco],
          className,
        )}
        {...props}
      />
    );
  },
);
