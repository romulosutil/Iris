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
      className={cn(
        "rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      <dt className="font-display text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
        {rotulo}
      </dt>
      <dd className="mt-1">
        <span className="font-display text-2xl font-semibold text-[var(--text-primary)]">
          {valor}
        </span>
        {descricao ? (
          <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
            {descricao}
          </span>
        ) : null}
      </dd>
    </dl>
  );
});
