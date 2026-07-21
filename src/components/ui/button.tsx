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
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  iconOnly?: boolean;
  isLoading?: boolean;
  tamanho?: "sm" | "md" | "lg";
  size?: "sm" | "md" | "lg";
  formato?: "padrao" | "circular";
  shape?: "square" | "circle";
}

function estiloVariante(v: Variante): string {
  switch (v) {
    case "primaria":
    case "primary":
      return cn(
        "bg-[color:var(--brand-primary)] text-[color:var(--ink-anchor)]",
        "border-[length:var(--border-brutal)] border-[color:var(--ink-anchor)]",
        "shadow-[var(--ds-shadow)]",
        "hover:bg-[color:var(--brand-hover)]",
        "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--ds-shadow-hover)]",
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
        "shadow-[var(--ds-shadow)]",
        "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--ds-shadow-hover)]",
        "active:translate-x-0 active:translate-y-0 active:shadow-none"
      );
  }
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variante = "primaria",
      type,
      risco,
      iconLeft,
      iconRight,
      iconOnly = false,
      isLoading = false,
      tamanho,
      size,
      formato = "padrao",
      shape,
      children,
      onClick,
      disabled,
      ...props
    },
    ref,
  ) {
    const classes = estiloVariante(variante);
    const resolvedTamanho = tamanho ?? size ?? "md";
    const resolvedFormato = formato ?? shape ?? "padrao";

    // Tamanhos e espaçamentos
    const tamanhoClasses = {
      sm: cn(
        "text-sm font-semibold",
        iconOnly ? "p-0" : "px-3 py-1.5 gap-1.5"
      ),
      md: cn(
        "text-base font-semibold",
        iconOnly ? "p-0" : "px-5 py-2.5 gap-2"
      ),
      lg: cn(
        "text-lg font-bold",
        iconOnly ? "p-0" : "px-6 py-3.5 gap-2.5"
      ),
    }[resolvedTamanho];

    // Formato circular vs padrão
    const formatoClasses =
      resolvedFormato === "circular" || shape === "circle"
        ? "rounded-full"
        : "rounded-[var(--radius-control)]";

    // Estado de carregamento
    const loadingClasses = isLoading
      ? "cursor-wait relative"
      : "";

    // Alerta de acessibilidade para Icon Only
    if (process.env.NODE_ENV !== "production" && iconOnly && !props["aria-label"]) {
      console.warn(
        "Acessibilidade: Botões 'iconOnly' devem possuir um 'aria-label' para leitores de tela."
      );
    }

    // Tamanho do spinner
    const spinnerSize = {
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
    }[resolvedTamanho];

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        disabled={disabled || isLoading}
        onClick={onClick}
        className={cn(
          // base: alvo de toque e layout
          control(resolvedTamanho),
          "inline-flex items-center justify-center font-display",
          "transition-[transform,box-shadow,background-color] duration-100 ease-out",
          tamanhoClasses,
          formatoClasses,
          loadingClasses,
          // anel de foco ortogonal de alto contraste da v3 (que não depende exclusivamente de cor)
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          // desabilitado: sem sombra, sem interação
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "disabled:active:translate-x-0 disabled:active:translate-y-0",
          classes,
          className,
        )}
        {...props}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              className={cn("animate-spin text-current", spinnerSize)}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
        <span
          className={cn(
            "inline-flex items-center justify-center gap-[inherit]",
            isLoading && "opacity-0"
          )}
        >
          {iconLeft && <span className="inline-flex shrink-0">{iconLeft}</span>}
          {!iconOnly && children}
          {iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
        </span>
      </button>
    );
  },
);
