import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Stat: uma célula de dado sóbria (rótulo + valor), NÃO o hero-metric de SaaS.
 * Valor no teto de text-2xl, sem gradiente, sem grade de cards idênticos —
 * hierarquia acima de uniformidade. Ex.: "12 aguardando revisão".
 * Não empilhar várias iguais lado a lado (vira o cliché que o produto recusa).
 */
export interface StatProps extends React.HTMLAttributes<HTMLElement> {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  descricao?: React.ReactNode;
}

export const Stat = React.forwardRef<HTMLElement, StatProps>(function Stat(
  { className, rotulo, valor, descricao, ...props },
  ref,
) {
  return (
    <dl
      ref={ref as React.Ref<HTMLDListElement>}
      className={cn("border-ink-anchor bg-surface border-2 p-4", className)}
      {...props}
    >
      <dt className="font-display text-graphite text-xs font-semibold tracking-wide uppercase">
        {rotulo}
      </dt>
      <dd className="mt-1">
        <span className="font-display text-ink-anchor text-2xl font-semibold">
          {valor}
        </span>
        {descricao ? (
          <span className="text-graphite mt-0.5 block text-sm">{descricao}</span>
        ) : null}
      </dd>
    </dl>
  );
});
