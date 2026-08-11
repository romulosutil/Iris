import * as React from "react";
import { cn } from "@/lib/cn";

export type PillVariant = "solid" | "outline" | "ghost" | "inset";
export type PillColorScheme =
  | "neutral"
  | "brand"
  | "menta"
  | "ouro"
  | "violeta"
  | "azul"
  | "coral";
export type PillSize = "sm" | "md";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  colorScheme?: PillColorScheme;
  size?: PillSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const colorVariants: Record<PillColorScheme, Record<PillVariant, string>> = {
  neutral: {
    solid: "bg-surface-card text-text-primary border-border-brutal",
    outline: "bg-transparent text-text-primary border-border-brutal",
    ghost: "bg-transparent text-text-secondary border-transparent",
    inset:
      "bg-surface-card/60 text-text-primary border-dashed border-border-brutal shadow-[var(--elevation-inset)]",
  },
  brand: {
    solid: "bg-action-primary text-action-primary-fg border-border-brutal",
    outline: "bg-transparent text-text-primary border-action-primary",
    ghost: "bg-action-primary/15 text-text-primary border-transparent",
    inset:
      "bg-action-primary/10 text-text-primary border-dashed border-action-primary shadow-[var(--elevation-inset)]",
  },
  ouro: {
    solid: "bg-status-warning-bg text-status-warning-fg border-border-brutal",
    outline: "bg-transparent text-status-warning-fg border-status-warning-border",
    ghost: "bg-status-warning-bg/20 text-status-warning-fg border-transparent",
    inset:
      "bg-status-warning-bg/10 text-status-warning-fg border-dashed border-status-warning-border shadow-[var(--elevation-inset)]",
  },
  menta: {
    solid: "bg-status-success-bg text-status-success-fg border-border-brutal",
    outline: "bg-transparent text-status-success-fg border-status-success-border",
    ghost: "bg-status-success-bg/20 text-status-success-fg border-transparent",
    inset:
      "bg-status-success-bg/10 text-status-success-fg border-dashed border-status-success-border shadow-[var(--elevation-inset)]",
  },
  violeta: {
    solid: "bg-status-ia-bg text-status-ia-fg border-status-ia-border",
    outline: "bg-transparent text-status-ia-fg border-status-ia-border",
    ghost: "bg-status-ia-bg/20 text-status-ia-fg border-transparent",
    inset:
      "bg-status-ia-bg/10 text-status-ia-fg border-dashed border-status-ia-border shadow-[var(--elevation-inset)]",
  },
  azul: {
    solid: "bg-status-info-bg text-status-info-fg border-border-brutal",
    outline: "bg-transparent text-status-info-fg border-status-info-border",
    ghost: "bg-status-info-bg/20 text-status-info-fg border-transparent",
    inset:
      "bg-status-info-bg/10 text-status-info-fg border-dotted border-status-info-border shadow-[var(--elevation-inset)]",
  },
  coral: {
    solid: "bg-status-error-bg text-status-error-fg border-border-brutal",
    outline: "bg-transparent text-status-error-fg border-status-error-border",
    ghost: "bg-status-error-bg/20 text-status-error-fg border-transparent",
    inset:
      "bg-status-error-bg/10 text-status-error-fg border-dashed border-status-error-border shadow-[var(--elevation-inset)]",
  },
};

const sizes: Record<PillSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

/**
 * Pill — Componente primitivo agnóstico de formato pílula.
 * Base para selos visuais, tags e badges.
 */
export function Pill({
  variant = "solid",
  colorScheme = "neutral",
  size = "md",
  icon,
  children,
  className,
  ...props
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium tracking-tight rounded-full border border-[length:var(--border-brutal)] select-none",
        sizes[size],
        colorVariants[colorScheme][variant],
        className,
      )}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
