import * as React from "react";
import { cn } from "@/lib/cn";

export interface DataRowProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  interactive?: boolean;
  como?: "div" | "li" | "article" | "section";
}

export const DataRow = React.forwardRef<HTMLDivElement, DataRowProps>(
  function DataRow(
    {
      className,
      title,
      subtitle,
      leading,
      trailing,
      interactive = false,
      como = "div",
      onClick,
      children,
      ...props
    },
    ref,
  ) {
    const Component = como as any;
    return (
      <Component
        ref={ref as any}
        onClick={onClick}
        className={cn(
          "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 rounded-[var(--radius-control)]",
          "border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--ds-shadow)]",
          interactive &&
            "cursor-pointer transition-transform duration-100 ease-out hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--elevation-3)] active:translate-x-0 active:translate-y-0 active:shadow-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto flex-1">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="font-display font-semibold text-base text-[var(--text-primary)]">
              {title}
            </div>
            {subtitle ? (
              <div className="text-sm text-[var(--text-secondary)]">
                {subtitle}
              </div>
            ) : null}
            {children}
          </div>
        </div>
        {trailing ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-brutal)]/20 sm:border-transparent">
            {trailing}
          </div>
        ) : null}

      </Component>
    );
  },
);
