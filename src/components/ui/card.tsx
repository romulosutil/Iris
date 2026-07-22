import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

export type EpistemicState = "fact" | "suggestion" | "conquistado" | "candidato";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @deprecated usar `epistemicState` */
  estado?: EpistemicState;
  epistemicState?: EpistemicState;
  /** Título do cartão; recebe tratamento display. */
  titulo?: React.ReactNode;
  /** Se true, adiciona barra de sotaque no topo */
  destacado?: boolean;
  /** Se true, força a borda esquerda espessa independente do estado */
  bordaEsquerda?: boolean;
  como?: "div" | "li" | "article" | "section";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, estado, epistemicState, titulo, destacado = false, bordaEsquerda = false, como = "div", children, ...props },
  ref,
) {
  const Component = como as any;
  const resolvedState = epistemicState ?? estado ?? "fact";
  const isFact = resolvedState === "fact" || resolvedState === "conquistado";

  const cardClasses = isFact
    ? cn(
        "bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-md text-[var(--text-primary)] shadow-[var(--shadow-brutal)]",
        (bordaEsquerda || resolvedState === "conquistado") && "border-l-[4px] border-l-[var(--status-success-border)]"
      )
    : "bg-[var(--ai-tint)] border-2 border-dashed border-[var(--ai-accent)] text-[var(--text-primary)] rounded-md";

  return (
    <Component
      ref={ref as any}
      data-estado={resolvedState}
      data-destacado={destacado}
      className={cn(
        "flex flex-col gap-2 p-5 text-[var(--text-primary)]",
        destacado && "relative pt-8",
        cardClasses,
        className,
      )}
      {...props}
    >
      {destacado ? (
        <span
          aria-hidden
          className="bg-[var(--action-primary)] absolute inset-x-0 top-0 h-2 rounded-t-md"
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {titulo ? (
          <h3 className="font-display text-[var(--text-primary)] text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        <span
          className={cn(
            "shrink-0 border-2 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide uppercase rounded-sm",
            isFact
              ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
              : "border-[var(--ai-accent)] bg-[var(--ai-tint)] text-[var(--ai-deep)]",
          )}
        >
          {isFact ? "Conquistado" : "Sugerido"}
        </span>
      </div>
      {children ? <div className="text-[var(--text-primary)] text-sm">{children}</div> : null}
    </Component>
  );
});

