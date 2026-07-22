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
    value?: number | null;
  }
>(function Progress({ className, value, ...props }, ref) {
  const isIndeterminate = value === null || value === undefined;
  const pct = isIndeterminate ? null : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={pct}
      className={cn(
        "border-[var(--border-brutal)] bg-[var(--bg-app)] relative h-4 w-full overflow-hidden border-2 rounded-[var(--radius-sm)]",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "bg-[var(--action-primary)] h-full transition-transform duration-300 ease-out",
          isIndeterminate && "w-full animate-pulse opacity-80"
        )}
        style={
          isIndeterminate
            ? undefined
            : { transform: `translateX(-${100 - (pct ?? 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
});
