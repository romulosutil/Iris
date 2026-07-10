import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * "Candidato" (sugerido pela IA) NUNCA tem a mesma aparência de "conquistado"
 * (fato consolidado) — princípio 4. A diferença é estrutural, não só cor:
 * preenchimento sólido + borda cheia vs. contorno tracejado + hachura leve +
 * selo de estado textual (redundante, nunca cor sozinha).
 */
type Estado = "conquistado" | "candidato";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  estado?: Estado;
  /** Título do cartão; recebe tratamento display. */
  titulo?: React.ReactNode;
}

// Hachura DELIBERADAMENTE de baixo contraste (aceite: nenhum padrão repetitivo
// de alto contraste). Sinaliza "candidato" junto do selo textual e da borda.
const hachuraCandidato =
  "bg-[repeating-linear-gradient(135deg,transparent,transparent_7px,color-mix(in_oklch,var(--color-ink)_8%,transparent)_7px,color-mix(in_oklch,var(--color-ink)_8%,transparent)_8px)]";

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, estado = "conquistado", titulo, children, ...props },
  ref,
) {
  const candidato = estado === "candidato";
  return (
    <div
      ref={ref}
      data-estado={estado}
      className={cn(
        "text-ink flex flex-col gap-2 p-5",
        candidato
          ? cn(
              "border-graphite bg-canvas border-2 border-dashed",
              hachuraCandidato,
            )
          : "border-ink-anchor bg-surface border-2 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        {titulo ? (
          <h3 className="font-display text-ink-anchor text-lg font-semibold">
            {titulo}
          </h3>
        ) : null}
        <span
          className={cn(
            "shrink-0 border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase",
            candidato
              ? "border-graphite bg-canvas text-graphite"
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
