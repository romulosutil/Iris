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
          "flex items-center justify-between gap-4 p-4 rounded-md",
          "border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-brutal)]",
          interactive &&
            "cursor-pointer transition-transform duration-100 ease-out hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--elevation-3)] active:translate-x-0 active:translate-y-0 active:shadow-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-display font-semibold text-base text-[var(--text-primary)] truncate">
              {title}
            </span>
            {subtitle ? (
              <span className="text-sm text-[var(--text-secondary)] truncate">
                {subtitle}
              </span>
            ) : null}
            {children}
          </div>
        </div>
        {trailing ? <div className="flex items-center gap-2 shrink-0">{trailing}</div> : null}
      </Component>
    );
  },
);
