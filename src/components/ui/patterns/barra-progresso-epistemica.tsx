import * as React from "react";
import { cn } from "@/lib/cn";

export interface BarraProgressoEpistemicaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** O que a barra mede (ex.: "Domínio mando"). Abre a leitura acessível. */
  rotulo: string;
  total: number;
  conquistados: number;
  candidatos: number;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * BarraProgressoEpistemica — barra empilhada conquistado / candidato a domínio /
 * não atingido (princípio 4 do DS).
 *
 * Três canais para o mesmo dado, nenhum deles só cor: (1) menta sólida vs
 * âmbar-neutro HACHURADO vs cinza silencioso; (2) divisor de 2px entre os
 * segmentos; (3) leitura completa em `aria-label` — "3 de 6 conquistados, 1
 * candidato a domínio, 2 não atingidos". `title` não é canal (AC-01): leitor
 * de tela não anuncia e o toque não mostra.
 */
export const BarraProgressoEpistemica = React.forwardRef<
  HTMLDivElement,
  BarraProgressoEpistemicaProps
>(function BarraProgressoEpistemica(
  { rotulo, total, conquistados, candidatos, className, ...props },
  ref,
) {
  const naoAtingidos = Math.max(total - conquistados - candidatos, 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const leitura = `${rotulo}: ${conquistados} de ${total} conquistados, ${plural(
    candidatos,
    "candidato a domínio",
    "candidatos a domínio",
  )}, ${plural(naoAtingidos, "não atingido", "não atingidos")}.`;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={leitura}
      className={cn(
        "border-border-brutal flex h-4 overflow-hidden rounded-[var(--radius-sm)] border-2 bg-[var(--surface-muted)]",
        className,
      )}
      {...props}
    >
      {conquistados > 0 ? (
        <div
          aria-hidden
          data-segmento="conquistado"
          style={{ width: `${pct(conquistados)}%` }}
          className="bg-status-success-border h-full"
        />
      ) : null}
      {candidatos > 0 ? (
        <div
          aria-hidden
          data-segmento="candidato"
          style={{ width: `${pct(candidatos)}%` }}
          className={cn(
            "bg-status-progresso-bg h-full bg-[image:var(--pattern-progresso-hachura)]",
            conquistados > 0 && "border-border-brutal border-l-2",
          )}
        />
      ) : null}
    </div>
  );
});
