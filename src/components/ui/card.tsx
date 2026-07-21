import * as React from "react";
import { cn } from "@/lib/cn";

export type EpistemicState = "fact" | "suggestion" | "conquistado" | "candidato";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  estado?: "conquistado" | "candidato";
  epistemicState?: EpistemicState;
  /** Título do cartão; recebe tratamento display. */
  titulo?: React.ReactNode;
  /** Injeta a barra dourada superior e altera o padding superior */
  destacado?: boolean;
  /** Adiciona um detalhe de borda esquerda 4px verde */
  bordaEsquerda?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, estado, epistemicState, titulo, destacado = false, bordaEsquerda = false, children, ...props },
  ref,
) {
  const resolvedState = epistemicState ?? estado ?? "fact";
  const isFact = resolvedState === "fact" || resolvedState === "conquistado";

  const cardClasses = isFact
    ? cn(
        "bg-white border-[length:var(--border-brutal)] border-[color:var(--ink-anchor)] shadow-[var(--shadow-composite)]",
        (bordaEsquerda || resolvedState === "conquistado") && "border-l-[4px] border-l-[color:var(--success-accent)]"
      )
    : "bg-[color:var(--ai-tint)] border-[length:1.5px] border-dashed border-[color:var(--ai-accent)] shadow-[var(--shadow-inset-ia)]";

  return (
    <div
      ref={ref}
      data-estado={resolvedState}
      data-destacado={destacado}
      className={cn(
        "text-text-body flex flex-col gap-2 p-5",
        destacado && "relative pt-8",
        cardClasses,
        className,
      )}
      {...props}
    >
      {destacado ? (
        <span
          aria-hidden
          className="bg-brand-primary absolute inset-x-0 top-0 h-2"
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {titulo ? (
          <h3 className="font-display text-text-heading text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        <span
          className={cn(
            "shrink-0 border-[length:var(--border-brutal)] px-2 py-0.5 text-xs font-semibold tracking-wide uppercase rounded-[length:var(--radius-pill)]",
            isFact
              ? "border-[color:var(--success-accent)] bg-[color:var(--success-tint)] text-[color:var(--success-deep)]"
              : "border-[color:var(--ai-accent)] bg-[color:var(--ai-tint)] text-[color:var(--ai-deep)]",
          )}
        >
          {isFact ? "Conquistado" : "Sugerido"}
        </span>
      </div>
      {children ? <div className="text-text-body">{children}</div> : null}
    </div>
  );
});

