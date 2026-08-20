import * as React from "react";
import { cn } from "@/lib/cn";
import { control } from "./primitives/surface";

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
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
  /** Slot para ação/botão interativo no fim do input (não escondido do leitor de tela). */
  suffixAction?: React.ReactNode;
  /** ClassName adicional para aplicar diretamente no elemento <input>/<textarea> interno. */
  inputClassName?: string;
}

export const Input = React.forwardRef<any, InputProps>(function Input(
  {
    className,
    inputClassName,
    type,
    size = "md",
    multiline = false,
    rows = 3,
    prefixIcon,
    suffixIcon,
    suffixAction,
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
    disabled && "cursor-not-allowed text-[var(--text-secondary)]",
    inputClassName,
  );

  return (
    <div
      onClick={handleWrapperClick}
      className={cn(
        "group flex w-full items-stretch rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)]",
        !multiline && control(size),
        !disabled && "cursor-text",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        !disabled &&
          "focus-within:outline-focus outline-none focus-within:outline-[length:var(--ring-width)] focus-within:outline-offset-[var(--ring-offset)]",
        ariaInvalid && "border-[var(--status-error-border)]",
        disabled &&
          "cursor-not-allowed bg-[var(--surface-elevated)] opacity-50",
        className,
      )}
    >
      {leftAddon && (
        <div
          className={cn(
            "font-body flex shrink-0 items-center justify-center rounded-l-[calc(var(--radius-control)-2px)] border-r border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-3 text-[var(--text-secondary)] select-none",
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
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center pl-3 text-[var(--text-secondary)]"
          >
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
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center pr-3 text-[var(--text-secondary)]"
          >
            {suffixIcon}
          </span>
        )}
        {suffixAction && (
          <div className="flex shrink-0 items-center justify-center pr-2">
            {suffixAction}
          </div>
        )}
      </div>
      {rightAddon && (
        <div
          className={cn(
            "font-body flex shrink-0 items-center justify-center rounded-r-[calc(0.375rem-2px)] border-l border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-3 text-[var(--text-secondary)] select-none",
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

function IconeOlhoAberto() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconeOlhoFechado() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export const InputSenha = React.forwardRef<any, InputProps>(
  function InputSenha(props, ref) {
    const [visivel, setVisivel] = React.useState(false);
    return (
      <Input
        {...props}
        ref={ref}
        type={visivel ? "text" : "password"}
        suffixAction={
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => setVisivel((v) => !v)}
            className="focus-visible:outline-focus flex items-center justify-center rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={visivel ? "Ocultar senha" : "Exibir senha em texto"}
          >
            {visivel ? <IconeOlhoFechado /> : <IconeOlhoAberto />}
          </button>
        }
      />
    );
  },
);
