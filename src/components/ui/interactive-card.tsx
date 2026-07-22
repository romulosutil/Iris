import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

export type EpistemicState = "fact" | "suggestion" | "conquistado" | "candidato";

export interface InteractiveCardProps
  extends React.HTMLAttributes<HTMLElement> {
  titulo?: React.ReactNode;
  destacado?: boolean;
  asChild?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  disabled?: boolean;
  epistemicState?: EpistemicState;
  estado?: "conquistado" | "candidato";
  bordaEsquerda?: boolean;
}

export const InteractiveCard = React.forwardRef<HTMLElement, InteractiveCardProps>(
  function InteractiveCard(
    {
      className,
      titulo,
      destacado = false,
      asChild = false,
      children,
      href,
      onClick,
      disabled,
      epistemicState,
      estado,
      bordaEsquerda = false,
      ...props
    },
    ref,
  ) {
    const resolvedState = epistemicState ?? estado ?? "fact";
    const isFact = resolvedState === "fact" || resolvedState === "conquistado";

    const baseCardClasses = isFact
      ? cn(
          "bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-md text-[var(--text-primary)] shadow-[var(--shadow-brutal)]",
          (bordaEsquerda || resolvedState === "conquistado") && "border-l-[4px] border-l-[var(--status-success-border)]"
        )
      : "bg-[var(--ai-tint)] border-2 border-dashed border-[var(--ai-accent)] text-[var(--text-primary)] rounded-md";

    const cardClasses = cn(
      "flex flex-col gap-2 p-5 text-left outline-none cursor-pointer select-none w-full text-[var(--text-primary)]",
      "transition-[transform,box-shadow,background-color] duration-100 ease-out",
      !disabled && isFact && "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--elevation-3)]",
      !disabled && !isFact && "hover:opacity-95",
      "active:translate-x-0 active:translate-y-0 active:shadow-none",
      "focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] focus-visible:outline-none",
      destacado && "relative pt-8",
      baseCardClasses,
      className,
    );

    const accentBar = destacado ? (
      <span
        aria-hidden
        className="bg-[var(--action-primary)] absolute inset-x-0 top-0 h-2 rounded-t-md"
      />
    ) : null;

    const titleHeading = titulo ? (
      <div className="font-display text-[var(--text-primary)] text-lg font-semibold">
        {titulo}
      </div>
    ) : null;

    const isLink = !!href;
    const isDisabled = disabled;

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      const childProps = isLink
        ? {
            href: isDisabled ? undefined : href,
            "aria-disabled": isDisabled ? "true" : undefined,
            tabIndex: isDisabled ? -1 : undefined,
            onClick: (e: React.MouseEvent<any>) => {
              if (isDisabled) {
                e.preventDefault();
                return;
              }
              child.props.onClick?.(e);
              onClick?.(e as any);
            },
          }
        : {
            disabled: isDisabled,
            onClick: (e: React.MouseEvent<any>) => {
              child.props.onClick?.(e);
              onClick?.(e as any);
            },
          };

      return React.cloneElement(child, {
        ref,
        className: cn(cardClasses, child.props.className),
        ...props,
        ...childProps,
        children: (
          <>
            {accentBar}
            {titleHeading}
            {child.props.children ? (
              <span className="block text-text-body w-full">
                {child.props.children}
              </span>
            ) : null}
          </>
        ),
      });
    }

    const Component = isLink ? "a" : "button";
    const componentProps = isLink
      ? {
          href: isDisabled ? undefined : href,
          "aria-disabled": isDisabled ? ("true" as const) : undefined,
          tabIndex: isDisabled ? -1 : undefined,
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (isDisabled) {
              e.preventDefault();
              return;
            }
            (onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined)?.(e);
          },
        }
      : {
          type: "button" as const,
          disabled: isDisabled,
          onClick: onClick as React.MouseEventHandler<HTMLButtonElement> | undefined,
        };

    return (
      <Component
        ref={ref as any}
        className={cardClasses}
        {...componentProps as any}
        {...props}
      >
        {accentBar}
        {titleHeading}
        {children ? (
          <span className="block text-text-body w-full">{children}</span>
        ) : null}
      </Component>
    );
  },
);

