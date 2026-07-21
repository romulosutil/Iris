import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
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
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref && typeof ref === "object") {
          ref.current = node;
        }
      },
      [ref],
    );

    const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("button, a, input, select, textarea, [role='button']")
      ) {
        return;
      }
      inputRef.current?.focus();
    };

    return (
      <div className={cn("flex w-full items-stretch", className)}>
        {leftAddon && (
          <div
            className={cn(
              "font-body flex items-center justify-center rounded-l-[length:var(--radius-control)] border-[length:1.5px] border-r-0 border-[color:var(--border-neutral-light)] bg-[color:var(--color-canvas)] px-3 text-[color:var(--color-text-body)]/70 select-none",
              size === "sm" && "text-sm",
              size === "md" && "text-base",
              size === "lg" && "text-base",
              disabled &&
                "cursor-not-allowed border-[color:var(--border-neutral-light)]/50 text-[color:var(--color-text-body)]/70",
            )}
          >
            {leftAddon}
          </div>
        )}
        <div
          onClick={handleWrapperClick}
          className={cn(
            "flex flex-1 items-center border-[length:1.5px] border-[color:var(--border-neutral-light)] bg-[color:var(--color-bg-surface)]",
            !disabled && "cursor-text",
            leftAddon
              ? "rounded-l-none"
              : "rounded-l-[length:var(--radius-control)]",
            rightAddon
              ? "rounded-r-none"
              : "rounded-r-[length:var(--radius-control)]",
            "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
            // hover state
            !disabled &&
              "hover:border-[color:var(--ink-anchor)] hover:bg-[color:var(--gray-light-hover)]",
            // focus state (focus-within)
            !disabled &&
              "focus-within:border-[color:var(--color-focus)] focus-within:shadow-[var(--shadow-focus-ring)] focus-within:outline-none",
            // error/aria-invalid
            ariaInvalid && "border-[color:var(--color-spectrum-red)]",
            // disabled - WCAG contrast compliant (bg and text tokens, no opacity-50)
            disabled &&
              "cursor-not-allowed border-[color:var(--border-neutral-light)]/50 bg-[color:var(--color-canvas)]",
          )}
        >
          {prefixIcon && (
            <span className="pointer-events-none flex shrink-0 items-center justify-center pl-3 text-[color:var(--color-text-body)]/60">
              {prefixIcon}
            </span>
          )}
          <input
            ref={handleRef}
            type={type ?? "text"}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={cn(
              "font-body placeholder:text-graphite/60 w-full bg-transparent text-[color:var(--color-text-body)] focus:outline-none",
              size === "sm" &&
                "min-h-[var(--input-height-sm)] px-2.5 py-1 text-sm",
              size === "md" &&
                "min-h-[var(--input-height-md)] px-3.5 py-2 text-base",
              size === "lg" &&
                "min-h-[var(--input-height-lg)] px-4 py-3 text-base",
              disabled &&
                "cursor-not-allowed text-[color:var(--color-text-body)]/70",
            )}
            {...props}
          />
          {suffixIcon && (
            <span className="pointer-events-none flex shrink-0 items-center justify-center pr-3 text-[color:var(--color-text-body)]/60">
              {suffixIcon}
            </span>
          )}
        </div>
        {rightAddon && (
          <div
            className={cn(
              "font-body flex items-center justify-center rounded-r-[length:var(--radius-control)] border-[length:1.5px] border-l-0 border-[color:var(--border-neutral-light)] bg-[color:var(--color-canvas)] px-3 text-[color:var(--color-text-body)]/70 select-none",
              size === "sm" && "text-sm",
              size === "md" && "text-base",
              size === "lg" && "text-base",
              disabled &&
                "cursor-not-allowed border-[color:var(--border-neutral-light)]/50 text-[color:var(--color-text-body)]/70",
            )}
          >
            {rightAddon}
          </div>
        )}
      </div>
    );
  },
);
