import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  function PageHeader(
    { className, title, description, actions, badge, children, ...props },
    ref,
  ) {
    return (
      <header
        ref={ref}
        className={cn(
          "flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 mb-6 border-b-2 border-dashed border-[var(--border-brutal)]",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              {title}
            </h1>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          {description ? (
            <p className="text-sm md:text-base text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {actions}
          </div>
        ) : null}
      </header>
    );
  },
);
