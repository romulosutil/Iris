"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/cn";

/**
 * Progress sobre Radix (role=progressbar + aria-value* de graça), vestido com
 * Espectro Brutal. Linear e sóbrio — progresso do dossiê rumo à janela de
 * avaliação. Sem number gigante, sem gradiente (não é hero-metric).
 */
export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number;
  }
>(function Progress({ className, value = 0, ...props }, ref) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={pct}
      className={cn(
        "border-ink-anchor bg-canvas relative h-4 w-full overflow-hidden border-2",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="bg-gold h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
