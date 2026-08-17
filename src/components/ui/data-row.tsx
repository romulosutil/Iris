import * as React from "react";
import { cn } from "@/lib/cn";

export interface DataRowProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
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
          "flex flex-col items-start justify-between gap-3 rounded-[var(--radius-control)] p-4 sm:flex-row sm:items-center sm:gap-4",
          "border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--ds-shadow)]",
          interactive &&
            "cursor-pointer transition-transform duration-100 ease-out hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--elevation-3)] active:translate-x-0 active:translate-y-0 active:shadow-none",
          className,
        )}
        {...props}
      >
        <div className="flex w-full min-w-0 flex-1 items-center gap-3 sm:w-auto">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="font-display text-base font-semibold text-[var(--text-primary)]">
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
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-brutal)]/20 pt-2 sm:w-auto sm:justify-end sm:border-t-0 sm:border-transparent sm:pt-0">
            {trailing}
          </div>
        ) : null}
      </Component>
    );
  },
);
