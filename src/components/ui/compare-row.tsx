import * as React from "react";
import { cn } from "@/lib/cn";

export interface CompareRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leftTitle?: React.ReactNode;
  leftContent: React.ReactNode;
  rightTitle?: React.ReactNode;
  rightContent: React.ReactNode;
}

export const CompareRow = React.forwardRef<HTMLDivElement, CompareRowProps>(
  function CompareRow(
    { className, leftTitle = "Sugerido", leftContent, rightTitle = "Histórico", rightContent, ...props },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] overflow-hidden bg-[var(--bg-app)]",
          className
        )}
        {...props}
      >
        {/* Left column (Sugerido/Atual) */}
        <div className="flex flex-col gap-2 p-4 bg-[var(--surface-card)] md:border-r-2 md:border-r-[var(--border-brutal)]">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            {leftTitle}
          </h4>
          <div className="text-sm text-[var(--text-primary)] font-semibold">
            {leftContent}
          </div>
        </div>

        {/* Right column (Histórico) */}
        <div className="flex flex-col gap-2 p-4 bg-[var(--status-warning-bg)]/20">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--status-warning-fg)] flex items-center gap-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3.2l2.2 1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {rightTitle}
          </h4>
          <div className="text-sm text-[var(--text-primary)] font-semibold">
            {rightContent}
          </div>
        </div>
      </div>
    );
  }
);
