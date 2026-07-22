"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

/**
 * Slider sobre Radix, vestido com Espectro Brutal. Canto vivo (thumb quadrado,
 * não redondo — coerente com o resto do sistema), trilho com borda âncora,
 * preenchimento ouro. Teclado e ARIA de valor vêm do Radix.
 */
export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider(
  { className, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...props },
  ref,
) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none items-center select-none",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="border-[var(--border-brutal)] bg-[var(--bg-app)] relative h-3 w-full grow overflow-hidden border-2 rounded-[var(--radius-xs)]">
        <SliderPrimitive.Range className="bg-[var(--action-primary)] absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        // Radix não propaga o nome acessível do Root para o thumb (role=slider):
        // encaminhamos aqui para satisfazer aria-input-field-name.
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cn(
          "border-[var(--border-brutal)] bg-[var(--surface-card)] relative block size-5 border-2 rounded-[var(--radius-xs)]",
          "after:absolute after:-inset-3 after:content-['']", // alvo de toque expandido (44px WCAG 2.5.5)
          "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    </SliderPrimitive.Root>
  );
});
