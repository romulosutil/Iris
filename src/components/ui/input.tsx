import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /**
   * Variações de tamanho do controle.
   * sm (32px), md (40px - padrão), lg (48px)
   */
  size?: "sm" | "md" | "lg";
  /** Ícone interno renderizado no início do input. */
  prefixIcon?: React.ReactNode;
  /** Ícone interno renderizado no fim do input. */
  suffixIcon?: React.ReactNode;
  /** Elemento/texto acoplado no início (fora do campo, mas visualmente unido). */
  leftAddon?: React.ReactNode;
  /** Elemento/texto acoplado no fim (fora do campo, mas visualmente unido). */
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      className,
      type,
      size = "md",
      prefixIcon,
      suffixIcon,
      leftAddon,
      rightAddon,
      disabled,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) {
    return (
      <div className="flex w-full items-stretch">
        {leftAddon && (
          <div
            className={cn(
              "flex items-center justify-center border-[length:1.5px] border-r-0 border-[color:var(--border-neutral-light)] bg-[color:var(--color-canvas)] text-[color:var(--color-text-body)]/70 font-body select-none rounded-l-[length:var(--radius-control)] px-3",
              size === "sm" && "text-sm",
              size === "md" && "text-base",
              size === "lg" && "text-base",
              disabled && "opacity-50"
            )}
          >
            {leftAddon}
          </div>
        )}
        <div
          className={cn(
            "flex flex-1 items-center bg-[color:var(--color-bg-surface)] border-[length:1.5px] border-[color:var(--border-neutral-light)]",
            leftAddon ? "rounded-l-none" : "rounded-l-[length:var(--radius-control)]",
            rightAddon ? "rounded-r-none" : "rounded-r-[length:var(--radius-control)]",
            "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
            // hover state
            !disabled && "hover:bg-[color:var(--gray-light-hover)] hover:border-[color:var(--ink-anchor)]",
            // focus state (focus-within)
            !disabled && "focus-within:border-[color:var(--color-focus)] focus-within:shadow-[var(--shadow-focus-ring)] focus-within:outline-none",
            // error/aria-invalid
            ariaInvalid && "border-[color:var(--color-spectrum-red)]",
            // disabled - WCAG contrast compliant (bg and text tokens, no opacity-50)
            disabled && "bg-[color:var(--color-canvas)] border-[color:var(--border-neutral-light)]/50 cursor-not-allowed",
            className,
          )}
        >
          {prefixIcon && (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center pl-3 text-[color:var(--color-text-body)]/60",
                disabled && "opacity-50"
              )}
            >
              {prefixIcon}
            </span>
          )}
          <input
            ref={ref}
            type={type ?? "text"}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={cn(
              "w-full bg-transparent font-body focus:outline-none text-[color:var(--color-text-body)] placeholder:text-graphite/60",
              size === "sm" && "min-h-[var(--input-height-sm)] text-sm px-2.5 py-1",
              size === "md" && "min-h-[var(--input-height-md)] text-base px-3.5 py-2",
              size === "lg" && "min-h-[var(--input-height-lg)] text-base px-4 py-3",
              disabled && "text-[color:var(--color-text-body)]/70 cursor-not-allowed",
            )}
            {...props}
          />
          {suffixIcon && (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center pr-3 text-[color:var(--color-text-body)]/60",
                disabled && "opacity-50"
              )}
            >
              {suffixIcon}
            </span>
          )}
        </div>
        {rightAddon && (
          <div
            className={cn(
              "flex items-center justify-center border-[length:1.5px] border-l-0 border-[color:var(--border-neutral-light)] bg-[color:var(--color-canvas)] text-[color:var(--color-text-body)]/70 font-body select-none rounded-r-[length:var(--radius-control)] px-3",
              size === "sm" && "text-sm",
              size === "md" && "text-base",
              size === "lg" && "text-base",
              disabled && "opacity-50"
            )}
          >
            {rightAddon}
          </div>
        )}
      </div>
    );
  },
);


