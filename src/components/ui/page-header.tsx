import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  function PageHeader(
    {
      className,
      title,
      description,
      actions,
      badge,
      breadcrumb,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <header
        ref={ref}
        className={cn(
          "mb-6 flex flex-col gap-4 border-b-2 border-dashed border-[var(--border-brutal)] pb-6 md:flex-row md:items-center md:justify-between",
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-col gap-1">
          {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">
              {title}
            </h1>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          {description ? (
            <p className="text-sm text-[var(--text-secondary)] md:text-base">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </header>
    );
  },
);
