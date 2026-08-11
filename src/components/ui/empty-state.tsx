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
        "flex flex-col items-center justify-center text-center rounded-[var(--radius-control)] border-2 border-border-brutal bg-surface-card text-text-primary shadow-[var(--ds-shadow)]",
        isCompact ? "p-4 sm:p-6 gap-3" : "p-6 sm:p-10 gap-4",
        isCelebration && "border-accent-mint bg-status-success-bg/15",
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
      <div className={cn("flex flex-col gap-1.5", isCompact ? "max-w-sm" : "max-w-md")}>
        <h3
          className={cn(
            "font-display font-bold text-text-primary",
            isCompact ? "text-sm sm:text-base" : "text-base sm:text-lg",
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="font-body text-xs sm:text-sm text-text-secondary leading-relaxed">
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
