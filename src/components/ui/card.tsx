import * as React from "react";
import { cn } from "@/lib/cn";
import { surface, type SurfaceVariante } from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/primitives/pill";
import { CheckIcon, SparkleIcon, LayersIcon } from "@/components/ui/icon";

export type EpistemicState =
  | "fact"
  | "suggestion"
  | "conquistado"
  | "candidato"
  | "sugerida"
  | "candidata";

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
  {
    className,
    estado,
    epistemicState,
    titulo,
    destacado = false,
    bordaEsquerda = false,
    como = "div",
    children,
    ...props
  },
  ref,
) {
  const Component = como as any;
  const resolvedState = epistemicState ?? estado ?? "fact";

  // Eixo Estrutural de Profundidade:
  // - fato/conquistado: solida (LEVANTA com --ds-shadow)
  // - sugerida/suggestion: sugerida (AFUNDA com --elevation-inset + tracejado violeta)
  // - candidata/candidato: candidata (AFUNDA com --elevation-inset + pontilhado azul)
  let variante: SurfaceVariante = "solida";
  let badgeNode: React.ReactNode = null;

  if (resolvedState === "suggestion" || resolvedState === "sugerida") {
    variante = "sugerida";
    badgeNode = (
      <Pill variant="inset" colorScheme="violeta" size="sm" icon={<SparkleIcon size={12} />}>
        Sugerido
      </Pill>
    );
  } else if (resolvedState === "candidato" || resolvedState === "candidata") {
    variante = "candidata";
    badgeNode = (
      <Pill variant="inset" colorScheme="azul" size="sm" icon={<LayersIcon size={12} />}>
        Candidato
      </Pill>
    );
  } else {
    variante = "solida";
    badgeNode = (
      <Pill variant="solid" colorScheme="menta" size="sm" icon={<CheckIcon size={12} />}>
        Conquistado
      </Pill>
    );
  }

  const isFact = variante === "solida";
  const surfaceStyle = surface(variante, {
    radius: "control",
    className: cn(
      isFact ? "bg-[var(--surface-card)]" : "bg-[var(--surface-card)]/80",
      (bordaEsquerda || resolvedState === "conquistado") &&
        "border-l-[4px] border-l-[var(--status-success-border)]",
    ),
  });

  return (
    <Component
      ref={ref as any}
      data-estado={resolvedState}
      data-destacado={destacado}
      className={cn(
        "flex flex-col gap-2 p-5 text-[var(--text-primary)]",
        destacado && "relative pt-8",
        surfaceStyle,
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
        <div className="shrink-0">{badgeNode}</div>
      </div>
      {children ? <div className="text-[var(--text-primary)] text-sm">{children}</div> : null}
    </Component>
  );
});
