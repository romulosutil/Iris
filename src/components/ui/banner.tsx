import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

export type BannerVariant = "info" | "alerta" | "sucesso";

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  titulo?: React.ReactNode;
}

const estiloBanner: Record<BannerVariant, { container: string; bar: string }> = {
  info: {
    container: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-2 border-[var(--border-brutal)] rounded-md shadow-[var(--shadow-brutal)]",
    bar: "bg-[var(--status-info-border)]",
  },
  alerta: {
    container: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-2 border-[var(--border-brutal)] rounded-md shadow-[var(--shadow-brutal)]",
    bar: "bg-[var(--status-error-border)]",
  },
  sucesso: {
    container: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-2 border-[var(--border-brutal)] rounded-md shadow-[var(--shadow-brutal)]",
    bar: "bg-[var(--status-success-border)]",
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
        "relative p-6 flex flex-col gap-2 pt-8 overflow-hidden",
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
