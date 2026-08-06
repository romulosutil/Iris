"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/cn";

/**
 * Progress sobre Radix (role=progressbar + aria-value* de graça), vestido com
 * Espectro Brutal. Linear e sóbrio — progresso do dossiê rumo à janela de
 * avaliação. Sem number gigante, sem gradiente (não é hero-metric).
 */
/**
 * Variante semântica do preenchimento. `acao` é o default histórico (progresso
 * neutro do dossiê); as demais existem porque a barra de cobertura da equipe
 * (#203) tem QUATRO estados com leituras diferentes. A cor é sempre reforço —
 * quem chama continua obrigado a dizer o estado por extenso no rótulo.
 */
export type ProgressVariante =
  "acao" | "neutro" | "atencao" | "sucesso" | "erro";

const varianteIndicador: Record<ProgressVariante, string> = {
  acao: "bg-[var(--action-primary)]",
  neutro: "bg-[var(--text-secondary)]",
  atencao: "bg-[var(--status-warning-border)]",
  sucesso: "bg-[var(--status-success-border)]",
  erro: "bg-[var(--status-error-border)]",
};

export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number | null;
    variante?: ProgressVariante;
  }
>(function Progress({ className, value, variante = "acao", ...props }, ref) {
  const isIndeterminate = value === null || value === undefined;
  const pct = isIndeterminate ? null : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={pct}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-[var(--radius-sm)] border-2 border-[var(--border-brutal)] bg-[var(--bg-app)]",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full transition-transform duration-300 ease-out",
          varianteIndicador[variante],
          isIndeterminate && "w-full animate-pulse opacity-80",
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
