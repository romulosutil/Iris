import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

export interface InteractiveCardProps
  extends React.HTMLAttributes<HTMLElement> {
  titulo?: React.ReactNode;
  destacado?: boolean;
  asChild?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  disabled?: boolean;
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
      ...props
    },
    ref,
  ) {
    const cardClasses = cn(
      "text-text-body flex flex-col gap-2 p-5 text-left outline-none cursor-pointer select-none w-full",
      "transition-[transform,box-shadow,background-color] duration-100 ease-out",
      "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-hover",
      "active:translate-x-0 active:translate-y-0 active:shadow-none",
      "focus-visible:outline-focus-ring focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
      destacado
        ? cn("relative pt-8", surface("solida", "bg-bg-surface"))
        : surface("solida", "bg-bg-surface"),
      className,
    );

    const accentBar = destacado ? (
      <span
        aria-hidden
        className="bg-brand-primary absolute inset-x-0 top-0 h-2"
      />
    ) : null;

    const titleHeading = titulo ? (
      <div className="font-display text-text-heading text-lg font-semibold">
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
