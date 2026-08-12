import * as React from "react";
import { cn } from "@/lib/cn";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variante?: "solid" | "outline" | "ghost";
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { className, variante = "solid", children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-0.5 font-mono text-xs font-semibold tracking-wide uppercase rounded-[var(--radius-pill)] border-2",
        variante === "solid" && "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)]",
        variante === "outline" && "bg-transparent border-[var(--border-brutal)] text-[var(--text-primary)]",
        variante === "ghost" && "bg-transparent border-transparent text-[var(--text-secondary)]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
});
