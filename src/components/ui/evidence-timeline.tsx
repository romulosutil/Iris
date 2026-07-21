import * as React from "react";
import { cn } from "@/lib/cn";

export type EvidenceKind = "fato-success" | "fato-brand" | "sugestao";

export interface EvidenceItem {
  /** Natureza do nó — fato confirmado (círculo cheio) ou sugestão IA (tracejado). */
  tipo: EvidenceKind;
  /** Título do evento (peso 600, cor --deep do estado). */
  titulo: string;
  /** Subtítulo descritivo em cinza. */
  descricao?: React.ReactNode;
}

export interface EvidenceTimelineProps
  extends React.HTMLAttributes<HTMLOListElement> {
  itens: EvidenceItem[];
}

const nodeClasses: Record<EvidenceKind, string> = {
  "fato-success":
    "border-solid border-[color:var(--ink-anchor)] bg-[color:var(--success-accent)]",
  "fato-brand":
    "border-solid border-[color:var(--ink-anchor)] bg-[color:var(--brand-primary)]",
  sugestao:
    "border-dashed border-[color:var(--ai-accent)] bg-[color:var(--color-bg-surface)]",
};

const titleClasses: Record<EvidenceKind, string> = {
  "fato-success": "text-[color:var(--success-deep)]",
  "fato-brand": "text-[color:var(--ink-anchor)]",
  sugestao: "text-[color:var(--ai-deep)]",
};

/**
 * Linha do tempo de evidências. Cada item = conector visual (nó + linha
 * vertical que liga ao próximo) + bloco de texto. Nó cheio = fato; nó
 * tracejado branco = sugestão IA.
 */
export const EvidenceTimeline = React.forwardRef<
  HTMLOListElement,
  EvidenceTimelineProps
>(function EvidenceTimeline({ className, itens, ...props }, ref) {
  return (
    <ol
      ref={ref}
      className={cn("flex flex-col gap-0", className)}
      {...props}
    >
      {itens.map((item, i) => {
        const ultimo = i === itens.length - 1;
        return (
          <li key={i} className="flex gap-[14px]">
            {/* Conector visual: nó + linha vertical até o próximo item */}
            <div className="flex flex-col items-center self-stretch">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 size-[13px] shrink-0 rounded-[var(--radius-pill)] border-[1.5px]",
                  nodeClasses[item.tipo],
                )}
              />
              {!ultimo && (
                <span
                  aria-hidden
                  className="w-0.5 flex-1 bg-[color:var(--border-neutral-light)]"
                />
              )}
            </div>

            {/* Bloco de texto */}
            <div className={cn("pb-6", ultimo && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-semibold leading-tight",
                  titleClasses[item.tipo],
                )}
              >
                {item.titulo}
              </p>
              {item.descricao && (
                <p className="mt-1 text-sm text-[color:var(--color-graphite)]">
                  {item.descricao}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
});
