import * as React from "react";
import { cn } from "@/lib/cn";
import { control } from "./primitives/surface";

/**
 * Escala de ênfase (Espectro Brutal v3). O PESO é o antídoto contra "wireframe":
 * primária e secundária carregam a superfície sólida com sombra dura que
 * LEVANTA (não são contornos finos); só a terciária é leve, para ações de
 * baixa ênfase (cancelar, voltar).
 */
type Variante =
  | "primaria"
  | "secundaria"
  | "terciaria"
  | "neutra"
  | "primary"
  | "secondary"
  | "tertiary";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /** @deprecated O peso do botão agora é uniforme; esta prop não altera o visual. */
  risco?: "baixo" | "alto";
}

function estiloVariante(v: Variante): string {
  switch (v) {
    case "primaria":
    case "primary":
      return cn(
        "bg-[color:var(--brand-primary)] text-[color:var(--ink-anchor)]",
        "border-[length:var(--border-brutal)] border-[color:var(--ink-anchor)]",
        "shadow-[var(--shadow-composite)]",
        "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[4px_4px_0_0_var(--ink-anchor),var(--shadow-soft)]",
        "active:translate-x-0 active:translate-y-0 active:shadow-none"
      );
    case "terciaria":
    case "tertiary":
      return cn(
        "border-transparent bg-transparent text-gray-500 shadow-none",
        "hover:bg-[color:var(--gray-light-hover)] hover:text-[color:var(--ink-anchor)]",
        "disabled:hover:bg-transparent disabled:hover:text-gray-500"
      );
    case "secundaria":
    case "secondary":
    case "neutra":
    default:
      return cn(
        "bg-white text-[color:var(--color-text-body)]",
        "border-[length:var(--border-brutal)] border-[color:var(--ink-anchor)]",
        "shadow-[var(--shadow-composite)]",
        "hover:-translate-x-[1px] hover:-translate-y-[1px]",
        "active:translate-x-0 active:translate-y-0 active:shadow-none"
      );
  }
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variante = "primaria", type, risco, ...props },
    ref,
  ) {
    const classes = estiloVariante(variante);
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          // base: alvo de toque (piso 44×44), tipografia display, layout
          control("sm"),
          "inline-flex items-center justify-center px-5 py-2.5",
          "font-display text-base font-semibold",
          "transition-[transform,box-shadow,background-color] duration-100 ease-out",
          // anel de foco ortogonal da v3
          "focus-visible:border-[#2274A5] focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none",
          // desabilitado: sem sombra, sem interação
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "disabled:active:translate-x-0 disabled:active:translate-y-0",
          classes,
          className,
        )}
        {...props}
      />
    );
  },
);

