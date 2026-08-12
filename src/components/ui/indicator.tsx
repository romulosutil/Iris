import * as React from "react";
import { cn } from "@/lib/cn";

type IndicatorVariant = "conquistado" | "sugerido" | "erro" | "info";

export interface IndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: IndicatorVariant;
}

const estiloIndicator: Record<IndicatorVariant, string> = {
  conquistado: "bg-[var(--status-success-border)]",
  sugerido: "bg-[var(--status-ia-border)]",
  erro: "bg-[var(--status-error-border)]",
  info: "bg-[var(--status-info-border)]",
};

export const Indicator = React.forwardRef<HTMLSpanElement, IndicatorProps>(
  function Indicator({ className, variant = "info", ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full border border-border-brutal shadow-brutal-xs shrink-0",
          estiloIndicator[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
