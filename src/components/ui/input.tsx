import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type ?? "text"}
        className={cn(
          // base neobrutalista: mesma linguagem do Button — borda âncora +
          // sem sombra dura (input não é ação, não recebe deslocamento).
          "min-h-11 w-full px-4 py-2.5",
          "bg-surface text-ink font-body text-base",
          "border-ink-anchor border-2",
          "placeholder:text-graphite/60",
          "transition-[border-color,box-shadow] duration-100 ease-out",
          // anel de foco ortogonal — mesmo token do Button.
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          // erro: sinal estrutural (borda), NUNCA só cor — o texto redundante
          // fica a cargo do <Field> (role="alert" associado via aria-describedby).
          "aria-invalid:border-[color:var(--color-spectrum-red)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
