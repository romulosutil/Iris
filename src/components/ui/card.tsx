import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "./primitives/surface";

/**
 * "Candidato" (a marco, Fase 4) NUNCA tem a mesma aparência de "conquistado"
 * (fato consolidado) — princípio 4. A diferença é ESTRUTURAL: conquistado tem
 * fill sólido + borda cheia + sombra que LEVANTA; candidato usa a superfície
 * que AFUNDA (sombra inset, pontilhado azul) — o dado ainda-não-fato recua
 * fisicamente sob um scan cansado. Selo textual redundante, nunca cor sozinha.
 * (Refactor pós-crítica /impeccable: antes graphite+hachura, agora o eixo de
 * profundidade compartilhado — ver docs/ux/refactor-design-system.md D3.)
 */
type Estado = "conquistado" | "candidato";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  estado?: Estado;
  /** Título do cartão; recebe tratamento display. */
  titulo?: React.ReactNode;
  /** Injeta a barra dourada superior e altera o padding superior */
  destacado?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, estado = "conquistado", titulo, destacado = false, children, ...props },
  ref,
) {
  const candidato = estado === "candidato";
  return (
    <div
      ref={ref}
      data-estado={estado}
      data-destacado={destacado}
      className={cn(
        "text-ink flex flex-col gap-2 p-5",
        destacado
          ? cn("relative pt-8", surface("solida", "bg-surface"))
          : candidato
            ? surface("candidata", "bg-canvas")
            : surface("solida", "bg-surface"),
        className,
      )}
      {...props}
    >
      {destacado ? (
        <span
          aria-hidden
          className="bg-gold absolute inset-x-0 top-0 h-2"
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {titulo ? (
          <h3 className="font-display text-ink-anchor text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        <span
          className={cn(
            "shrink-0 border-2 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase",
            candidato
              ? "border-[color:var(--color-blue)] bg-canvas text-ink"
              : "border-ink-anchor bg-mint text-ink-anchor",
          )}
        >
          {candidato ? "Candidato" : "Conquistado"}
        </span>
      </div>
      {children ? <div className="text-ink">{children}</div> : null}
    </div>
  );
});
