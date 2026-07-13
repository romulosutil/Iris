import * as React from "react";
import { cn } from "@/lib/cn";

export type BannerVariant = "info" | "alerta" | "sucesso";

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  titulo?: React.ReactNode;
}

const estiloBanner: Record<BannerVariant, { container: string; bar: string }> = {
  info: {
    container: "bg-status-info-bg text-status-info-text",
    bar: "bg-status-info-text",
  },
  alerta: {
    container: "bg-status-error-bg text-status-error-text",
    bar: "bg-status-error-text",
  },
  sucesso: {
    container: "bg-status-success-bg text-status-success-text",
    bar: "bg-status-success-text",
  },
};

export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { className, variant = "info", titulo, children, ...props },
  ref,
) {
  const { container, bar } = estiloBanner[variant];
  return (
    <div
      ref={ref}
      className={cn(
        "relative border-2 border-border-brutal p-6 shadow-[var(--ds-shadow)] flex flex-col gap-2 pt-8",
        container,
        className,
      )}
      {...props}
    >
      <div className={cn("absolute top-0 inset-x-0 h-2", bar)} />
      {titulo ? (
        <div className="font-display text-base font-bold uppercase tracking-wider">
          {titulo}
        </div>
      ) : null}
      <div className="text-sm font-medium leading-relaxed">{children}</div>
    </div>
  );
});
