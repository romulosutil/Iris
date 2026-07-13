import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

export interface InteractiveCardProps
  extends React.HTMLAttributes<HTMLElement> {
  titulo?: React.ReactNode;
  destacado?: boolean;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

export const InteractiveCard = React.forwardRef<HTMLElement, InteractiveCardProps>(
  function InteractiveCard(
    { className, titulo, destacado = false, href, onClick, children, ...props },
    ref,
  ) {
    const Component = href ? "a" : "button";
    const componentProps = href
      ? { href, onClick }
      : { onClick, type: "button" as const };

    return (
      <Component
        ref={ref as any}
        className={cn(
          "text-text-body flex flex-col gap-2 p-5 text-left outline-none cursor-pointer select-none w-full",
          "transition-[transform,box-shadow,background-color] duration-100 ease-out",
          "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
          "active:translate-x-0 active:translate-y-0 active:shadow-none",
          "focus-visible:outline-focus-ring focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          destacado
            ? cn("relative pt-8", surface("solida", "bg-bg-surface"))
            : surface("solida", "bg-bg-surface"),
          className,
        )}
        {...componentProps}
        {...props}
      >
        {destacado ? (
          <span
            aria-hidden
            className="bg-brand-primary absolute inset-x-0 top-0 h-2"
          />
        ) : null}
        {titulo ? (
          <h3 className="font-display text-text-heading text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        {children ? <div className="text-text-body w-full">{children}</div> : null}
      </Component>
    );
  },
);
