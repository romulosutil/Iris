import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /**
   * Variações de tamanho do controle.
   * sm (32px), md (40px - padrão), lg (48px)
   */
  size?: "sm" | "md" | "lg";
  /** Se true, renderiza um elemento <textarea> estilizado com o wrapper do DS. */
  multiline?: boolean;
  /** Número de linhas visíveis para o modo multiline. */
  rows?: number;
  /** Ícone interno renderizado no início do input. */
  prefixIcon?: React.ReactNode;
  /** Ícone interno renderizado no fim do input. */
  suffixIcon?: React.ReactNode;
  /** Elemento/texto acoplado no início (fora do campo, mas visualmente unido). */
  leftAddon?: React.ReactNode;
  /** Elemento/texto acoplado no fim (fora do campo, mas visualmente unido). */
  rightAddon?: React.ReactNode;
  /** ClassName adicional para aplicar diretamente no elemento <input>/<textarea> interno. */
  inputClassName?: string;
}

export const Input = React.forwardRef<
  any,
  InputProps
>(function Input(
  {
    className,
    inputClassName,
    type,
    size = "md",
    multiline = false,
    rows = 3,
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
  const inputRef = React.useRef<any>(null);

  const handleRef = React.useCallback(
    (node: any) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<any>).current = node;
      }
    },
    [ref],
  );

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target?.closest?.("button, a, input, select, textarea, [role='button']")
    ) {
      return;
    }
    inputRef.current?.focus();
  };

  const sharedFieldClasses = cn(
    "font-body placeholder:text-[var(--text-secondary)] w-full bg-transparent text-[var(--text-primary)] focus:outline-none resize-y",
    size === "sm" && "px-2.5 py-1 text-base sm:text-sm",
    size === "md" && "px-3.5 py-2 text-base",
    size === "lg" && "px-4 py-3 text-base",
    !multiline && size === "sm" && "min-h-[var(--input-height-sm)]",
    !multiline && size === "md" && "min-h-[var(--input-height-md)]",
    !multiline && size === "lg" && "min-h-[var(--input-height-lg)]",
    disabled && "cursor-not-allowed text-[var(--text-secondary)]",
    inputClassName,
  );

  return (
    <div
      onClick={handleWrapperClick}
      className={cn(
        "group flex w-full items-stretch rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)]",
        !disabled && "cursor-text",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        !disabled &&
          "focus-within:outline-focus outline-none focus-within:outline-[length:var(--ring-width)] focus-within:outline-offset-[var(--ring-offset)]",
        ariaInvalid && "border-[var(--status-error-border)]",
        disabled && "cursor-not-allowed opacity-50 bg-[var(--surface-elevated)]",
        className,
      )}
    >
      {leftAddon && (
        <div
          className={cn(
            "font-body flex shrink-0 items-center justify-center rounded-l-[calc(var(--radius-control)-2px)] border-r-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-3 text-[var(--text-secondary)] select-none",
            size === "sm" && "text-sm",
            size === "md" && "text-base",
            size === "lg" && "text-base",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {leftAddon}
        </div>
      )}
      <div
        className={cn(
          "flex flex-1 items-center bg-[var(--surface-card)] text-[var(--text-primary)]",
          leftAddon
            ? "rounded-l-none"
            : "rounded-l-[calc(var(--radius-control)-2px)]",
          rightAddon
            ? "rounded-r-none"
            : "rounded-r-[calc(var(--radius-control)-2px)]",
          disabled && "cursor-not-allowed bg-[var(--surface-elevated)]",
        )}
      >
        {prefixIcon && (
          <span aria-hidden="true" className="flex shrink-0 items-center justify-center pl-3 text-[var(--text-secondary)]">
            {prefixIcon}
          </span>
        )}
        {multiline ? (
          <textarea
            ref={handleRef}
            rows={rows}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={sharedFieldClasses}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={handleRef}
            type={type ?? "text"}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={sharedFieldClasses}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {suffixIcon && (
          <span aria-hidden="true" className="flex shrink-0 items-center justify-center pr-3 text-[var(--text-secondary)]">
            {suffixIcon}
          </span>
        )}
      </div>
      {rightAddon && (
        <div
          className={cn(
            "font-body flex shrink-0 items-center justify-center rounded-r-[calc(0.375rem-2px)] border-l-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-3 text-[var(--text-secondary)] select-none",
            size === "sm" && "text-sm",
            size === "md" && "text-base",
            size === "lg" && "text-base",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {rightAddon}
        </div>
      )}
    </div>
  );
});
