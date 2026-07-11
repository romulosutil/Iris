"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "@/lib/cn";

/**
 * Checkbox sobre Radix, vestido com Espectro Brutal. A caixa é 24px, mas o alvo
 * de toque real é a linha inteira (min-h-11 no <label>) — cumpre os 44px do
 * Modo Clínico sem inchar o glifo. Marcado usa o acento ouro.
 */
function Check() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Rótulo visível associado (clicável, amplia o alvo de toque). */
  label: React.ReactNode;
}

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className, label, id, ...props }, ref) {
  const gerado = React.useId();
  const idFinal = id ?? gerado;
  return (
    <label
      htmlFor={idFinal}
      className="text-ink font-body flex min-h-11 cursor-pointer items-center gap-3 text-base"
    >
      <CheckboxPrimitive.Root
        ref={ref}
        id={idFinal}
        className={cn(
          "border-ink-anchor bg-surface grid size-6 shrink-0 place-items-center border-2",
          "text-ink-anchor data-[state=checked]:bg-gold",
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>{label}</span>
    </label>
  );
});
