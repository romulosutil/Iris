import * as React from "react";
import { cn } from "@/lib/cn";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  error?: string;
}

/**
 * Label associado + slot (o input, ligado via `htmlFor`) + mensagem de erro
 * acessível. O consumidor liga `aria-describedby={`${htmlFor}-error`}` no
 * input quando `error` está presente — este componente só gera o id/role.
 * Texto de erro em `text-ink-anchor` (preto) para contraste AAA garantido
 * em qualquer fundo — a cor (borda terracotta/vermelha do Input) é sinal
 * redundante, nunca a única pista (princípio 4C).
 */
export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  function Field(
    { className, label, htmlFor, error, children, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      >
        <label
          htmlFor={htmlFor}
          className="text-[var(--text-primary)] font-display text-sm font-semibold"
        >
          {label}
        </label>
        {children}
        {error ? (
          <p
            id={`${htmlFor}-error`}
            role="alert"
            className="text-[var(--status-error-fg)] text-sm font-semibold"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
