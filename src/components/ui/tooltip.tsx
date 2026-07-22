import * as React from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  conteudo: React.ReactNode;
  posicao?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}

export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip({ className, conteudo, posicao = "top", children, ...props }, ref) {
    const [visivel, setVisivel] = React.useState(false);
    const tooltipId = React.useId();

    const posClasses = {
      top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
      bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
      left: "right-full mr-2 top-1/2 -translate-y-1/2",
      right: "left-full ml-2 top-1/2 -translate-y-1/2",
    };

    return (
      <div
        ref={ref}
        className="relative inline-flex"
        onMouseEnter={() => setVisivel(true)}
        onMouseLeave={() => setVisivel(false)}
        onFocus={() => setVisivel(true)}
        onBlur={() => setVisivel(false)}
        {...props}
      >
        {React.cloneElement(children, {
          "aria-describedby": tooltipId,
        } as React.HTMLAttributes<HTMLElement>)}

        {visivel ? (
          <div
            id={tooltipId}
            role="tooltip"
            className={cn(
              "absolute z-50 whitespace-nowrap border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--text-primary)] shadow-[var(--ds-shadow)] rounded-[var(--radius-xs)] animate-in fade-in-0 duration-150",
              posClasses[posicao],
              className,
            )}
          >
            {conteudo}
          </div>
        ) : null}
      </div>
    );
  },
);
