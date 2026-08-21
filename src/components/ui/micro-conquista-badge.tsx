import * as React from "react";
import { cn } from "@/lib/cn";
import { SparkleIcon, CheckIcon } from "@/components/ui/icon";

export interface MicroConquistaBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  icon?: "sparkle" | "check" | "none";
  animated?: boolean;
}

/**
 * MicroConquistaBadge — Selo animado e acolhedor para celebração de micro-conquistas clínicas.
 * Respeita preferências de redução de movimento e reforça o impacto do olhar clínico.
 */
export const MicroConquistaBadge = React.forwardRef<
  HTMLSpanElement,
  MicroConquistaBadgeProps
>(function MicroConquistaBadge(
  { children, icon = "sparkle", animated = true, className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "border-border-brutal text-ink-anchor inline-flex items-center gap-1.5 rounded-full border-2 bg-[var(--status-success-bg)] px-3 py-1",
        "font-mono text-xs font-bold tracking-wide shadow-[var(--ds-shadow)]",
        animated && "motion-safe:animate-pulse",
        className,
      )}
      {...props}
    >
      {icon === "sparkle" && (
        <SparkleIcon size={14} className="text-ink-anchor shrink-0" />
      )}
      {icon === "check" && (
        <CheckIcon size={14} className="text-ink-anchor shrink-0" />
      )}
      <span>{children}</span>
    </span>
  );
});
