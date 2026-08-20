"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type BannerVariant = "info" | "alerta" | "sucesso" | "neutro";
export type BannerFormato = "padrao" | "compacto" | "barra";

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  formato?: BannerFormato;
  titulo?: React.ReactNode;
  acao?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const estiloBannerPadrao: Record<
  BannerVariant,
  { container: string; bar: string }
> = {
  info: {
    container:
      "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]",
    bar: "bg-[var(--status-info-border)]",
  },
  alerta: {
    container:
      "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]",
    bar: "bg-[var(--status-error-border)]",
  },
  sucesso: {
    container:
      "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]",
    bar: "bg-[var(--status-success-border)]",
  },
  neutro: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]",
    bar: "bg-[var(--border-brutal)]",
  },
};

const estiloBannerCompacto: Record<
  BannerVariant,
  { container: string; accent: string }
> = {
  info: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-neutral-light)] rounded-[var(--radius-control)] shadow-none",
    accent: "border-l-[3px] border-l-[var(--status-info-border)]",
  },
  alerta: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-neutral-light)] rounded-[var(--radius-control)] shadow-none",
    accent: "border-l-[3px] border-l-[var(--status-error-border)]",
  },
  sucesso: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-neutral-light)] rounded-[var(--radius-control)] shadow-none",
    accent: "border-l-[3px] border-l-[var(--status-success-border)]",
  },
  neutro: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-neutral-light)] rounded-[var(--radius-control)] shadow-none",
    accent: "border-l-[3px] border-l-[var(--border-neutral-light)]",
  },
};

const estiloBannerBarra: Record<
  BannerVariant,
  { container: string; accent: string }
> = {
  info: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border-b border-[var(--border-neutral-light)] shadow-none",
    accent: "border-t-2 border-t-[var(--status-info-border)]",
  },
  alerta: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border-b border-[var(--border-neutral-light)] shadow-none",
    accent: "border-t-2 border-t-[var(--status-error-border)]",
  },
  sucesso: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border-b border-[var(--border-neutral-light)] shadow-none",
    accent: "border-t-2 border-t-[var(--status-success-border)]",
  },
  neutro: {
    container:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border-b border-[var(--border-neutral-light)] shadow-none",
    accent: "border-t-2 border-t-[var(--border-neutral-light)]",
  },
};

export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  function Banner(
    {
      className,
      variant = "info",
      formato = "padrao",
      titulo,
      acao,
      dismissible,
      onDismiss,
      children,
      ...props
    },
    ref,
  ) {
    const [visivel, setVisivel] = React.useState(true);
    const podeDispensar = dismissible || Boolean(onDismiss);

    if (!visivel) return null;

    const handleDismiss = () => {
      setVisivel(false);
      onDismiss?.();
    };

    if (formato === "compacto" || formato === "barra") {
      const estilo =
        formato === "compacto"
          ? estiloBannerCompacto[variant]
          : estiloBannerBarra[variant];

      return (
        <div
          ref={ref}
          role={variant === "alerta" ? "alert" : "status"}
          className={cn(
            "relative flex flex-col justify-between gap-3 p-3 px-4 sm:flex-row sm:items-center sm:px-5",
            estilo.container,
            estilo.accent,
            className,
          )}
          {...props}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <div className="flex flex-col gap-1 text-sm leading-relaxed text-[var(--text-primary)] sm:flex-row sm:items-center sm:gap-2">
              {titulo ? (
                <span className="font-display shrink-0 text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase">
                  {titulo}
                </span>
              ) : null}
              <div className="text-sm leading-normal font-normal text-[var(--text-secondary)] [&_a]:font-semibold [&_a]:text-[var(--text-primary)] [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-[var(--status-info-border)]">
                {children}
              </div>
            </div>
          </div>
          {acao || podeDispensar ? (
            <div className="flex shrink-0 items-center gap-3 self-end sm:self-center">
              {acao}
              {podeDispensar ? (
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dispensar aviso"
                  className="focus-visible:outline-focus flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--gray-light-hover)] hover:text-[var(--text-primary)]"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    const { container, bar } = estiloBannerPadrao[variant];
    return (
      <div
        ref={ref}
        role={variant === "alerta" ? "alert" : "status"}
        className={cn(
          "relative flex flex-col gap-2 overflow-hidden p-6 pt-8",
          container,
          className,
        )}
        {...props}
      >
        <div className={cn("absolute inset-x-0 top-0 h-2", bar)} />
        {podeDispensar ? (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dispensar aviso"
            className="focus-visible:outline-focus absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--gray-light-hover)] hover:text-[var(--text-primary)]"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        ) : null}
        {titulo ? (
          <div className="font-display text-base font-bold tracking-wider uppercase">
            {titulo}
          </div>
        ) : null}
        <div className="text-sm leading-relaxed font-medium">{children}</div>
        {acao ? (
          <div className="mt-2 flex items-center gap-3">{acao}</div>
        ) : null}
      </div>
    );
  },
);
