import * as React from "react";
import { cn } from "@/lib/cn";
import { control, surface } from "./primitives/surface";

type Risco = "baixo" | "alto";

/**
 * Escala de ênfase (Espectro Brutal). O PESO é o antídoto contra "wireframe":
 * primária e secundária carregam a superfície sólida com sombra dura que
 * LEVANTA (não são contornos finos); só a terciária é leve, para ações de
 * baixa ênfase (cancelar, voltar).
 */
type Variante =
  | "primaria" // CTA confiante — fill ouro, superfície elevada (ex.: Aprovar)
  | "secundaria" // ação neutra com peso — fill branco, mesma elevação
  | "terciaria" // baixa ênfase — sem fill, sem sombra (ex.: Cancelar)
  | "neutra"; // DEPRECADO: alias de `secundaria` (compat)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /**
   * Peso do deslocamento no clique escala com o risco da ação (princípio 2:
   * "fricção é ferramenta"). Só afeta as variantes com superfície (primária/
   * secundária); a terciária não tem sombra para colapsar.
   */
  risco?: Risco;
}

// Cada tier: classes de fill/superfície. `temPeso` liga o deslocamento no press.
function estiloVariante(v: Variante): { classes: string; temPeso: boolean } {
  switch (v) {
    case "primaria":
      return {
        classes: cn(surface("solida"), "bg-brand-primary text-brand-primary-text active:bg-brand-primary-hover"),
        temPeso: true,
      };
    case "terciaria":
      return {
        classes:
          "border-2 border-transparent bg-transparent text-text-body hover:bg-bg-canvas hover:underline hover:underline-offset-4 disabled:hover:bg-transparent disabled:hover:no-underline",
        temPeso: false,
      };
    case "secundaria":
    case "neutra":
    default:
      return {
        classes: cn(surface("solida"), "bg-bg-surface text-text-body"),
        temPeso: true,
      };
  }
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variante = "primaria", risco = "baixo", type, ...props },
    ref,
  ) {
    const { classes, temPeso } = estiloVariante(variante);
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          // base: alvo de toque (piso 44×44 — Casey), tipografia display, layout
          control("sm"),
          "inline-flex items-center justify-center px-5 py-2.5",
          "font-display text-base font-semibold",
          "transition-[transform,box-shadow,background-color] duration-100 ease-out",
          // anel de foco ortogonal — independente de hover/active
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          // desabilitado: sem sombra, sem interação
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "disabled:active:translate-x-0 disabled:active:translate-y-0",
          classes,
          // hover/press só nas variantes com peso (a leve não "afunda")
          temPeso && "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-hover",
          temPeso && "active:translate-x-0 active:translate-y-0 active:shadow-none",
          className,
        )}
        {...props}
      />
    );
  },
);
