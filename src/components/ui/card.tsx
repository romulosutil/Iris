import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/primitives/pill";
import { SparkleIcon, CheckIcon, LayersIcon } from "./icon";

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

  let cardClasses = "";
  if (isFact) {
    cardClasses = surface("solida", {
      radius: "control",
      className: cn(
        "bg-[var(--surface-card)] text-[var(--text-primary)]",
        (bordaEsquerda || resolvedState === "conquistado") && "border-l-[4px] border-l-[var(--status-success-border)]"
      )
    });
  } else if (resolvedState === "candidato") {
    // "marco-candidato = azul + Layers"
    cardClasses = surface("sugerida", {
      radius: "control",
      className: "bg-transparent border-[var(--status-info-border)] text-[var(--text-primary)]"
    });
  } else {
    // suggestion
    cardClasses = surface("sugerida", {
      radius: "control",
      className: "bg-transparent text-[var(--text-primary)]"
    });
  }

  const renderBadge = () => {
    switch (resolvedState) {
      case "conquistado":
      case "fact":
        return (
          <Pill className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] gap-1.5">
            <CheckIcon className="h-3.5 w-3.5" />
            <span>Conquistado</span>
          </Pill>
        );
      case "suggestion":
        return (
          <Pill className="border-[var(--status-ia-border)] bg-transparent text-[var(--status-ia-fg)] gap-1.5">
            <SparkleIcon className="h-3.5 w-3.5" />
            <span>Sugerido</span>
          </Pill>
        );
      case "candidato":
        return (
          <Pill className="border-[var(--status-info-border)] bg-transparent text-[var(--status-info-fg)] gap-1.5">
            <LayersIcon className="h-3.5 w-3.5" />
            <span>Candidato</span>
          </Pill>
        );
      default:
        return null;
    }
  };

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
          className="bg-[var(--action-primary)] absolute inset-x-0 top-0 h-2 rounded-t-[var(--radius-control)]"
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {titulo ? (
          <h3 className="font-display text-[var(--text-primary)] text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        {renderBadge()}
      </div>
      {children ? <div className="text-[var(--text-primary)] text-sm">{children}</div> : null}
    </Component>
  );
});
