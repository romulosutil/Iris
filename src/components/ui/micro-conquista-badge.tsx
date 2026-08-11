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
export const MicroConquistaBadge = React.forwardRef<HTMLSpanElement, MicroConquistaBadgeProps>(
  function MicroConquistaBadge(
    { children, icon = "sparkle", animated = true, className, ...props },
    ref,
  ) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border-2 border-border-brutal bg-accent-mint px-3 py-1 text-ink-anchor",
          "font-mono text-xs font-bold tracking-wide shadow-[2px_2px_0px_#1A1A1A]",
          animated && "motion-safe:animate-pulse",
          className,
        )}
        {...props}
      >
        {icon === "sparkle" && (
          <SparkleIcon size={14} className="shrink-0 text-ink-anchor" />
        )}
        {icon === "check" && (
          <CheckIcon size={14} className="shrink-0 text-ink-anchor" />
        )}
        <span>{children}</span>
      </span>
    );
  },
);
