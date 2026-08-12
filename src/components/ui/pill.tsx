import * as React from "react";
import { cn } from "@/lib/cn";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variante?: "success" | "warning" | "error" | "ai" | "info" | "neutral" | "brand";
  className?: string;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  function Pill({ className, variante = "neutral", children, ...props }, ref) {
    const variantStyles: Record<string, string> = {
      success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)] border-solid",
      warning: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)] border-solid",
      error: "bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-fg)] border-solid",
      ai: "bg-[var(--status-ia-bg)] border-[var(--status-ia-border)] text-[var(--status-ia-fg)] border-dashed",
      info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)] border-solid",
      brand: "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)] border-solid",
      neutral: "bg-[var(--surface-elevated)] border-[var(--border-brutal)] text-[var(--text-primary)] border-solid",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 border-2 px-2.5 py-0.5 rounded-[var(--radius-pill)]",
          "font-mono text-[10px] sm:text-xs font-semibold tracking-wide uppercase",
          variantStyles[variante] ?? variantStyles.neutral,
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
