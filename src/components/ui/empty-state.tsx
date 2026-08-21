import * as React from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  illustration?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "default" | "celebration" | "compact";
  borderless?: boolean;
}

/**
 * EmptyState — Container humanizado de estado vazio ou celebração.
 * Substitui emojis e caixas vazias burocráticas por acolhimento e clareza de ação.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  secondaryAction,
  badge,
  variant = "default",
  borderless = false,
  className,
  ...props
}: EmptyStateProps) {
  const isCompact = variant === "compact";
  const isCelebration = variant === "celebration";

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center text-center text-[var(--text-primary)]",
        borderless
          ? "border-0 bg-transparent shadow-none"
          : cn(
              "rounded-[var(--radius-lg)] border border-[var(--border-neutral-light)]/40 bg-[var(--surface-card)]",
              isCelebration &&
                "border-[var(--status-success-border)]/30 bg-[var(--status-success-bg)]/25",
            ),
        isCompact ? "gap-3 p-4 sm:p-6" : "gap-4 px-6 py-10 sm:px-10 sm:py-14",
        className,
      )}
      {...props}
    >
      {/* Badge opcional no topo */}
      {badge && <div className="mb-1">{badge}</div>}

      {/* Ilustração Line-Art */}
      {illustration && (
        <div className="flex shrink-0 items-center justify-center">
          {illustration}
        </div>
      )}

      {/* Textos: Título e Descrição Empática */}
      <div
        className={cn(
          "flex flex-col gap-1.5",
          isCompact ? "max-w-sm" : "max-w-md",
        )}
      >
        <h3
          className={cn(
            "font-display text-text-primary font-bold",
            isCompact ? "text-sm sm:text-base" : "text-base sm:text-lg",
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="font-body text-text-secondary text-xs leading-relaxed sm:text-sm">
            {description}
          </p>
        )}
      </div>

      {/* Ações (Primária e Secundária) */}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
