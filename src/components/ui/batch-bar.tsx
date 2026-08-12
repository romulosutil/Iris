import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export interface BatchBarProps extends React.HTMLAttributes<HTMLDivElement> {
  total: number;
  resolvidos: number;
  elegiveisLote: number;
  onAprovarLote?: () => void;
  carregando?: boolean;
}

export const BatchBar = React.forwardRef<HTMLDivElement, BatchBarProps>(
  function BatchBar(
    { className, total, resolvidos, elegiveisLote, onAprovarLote, carregando = false, ...props },
    ref
  ) {
    const progressoPct = total > 0 ? (resolvidos / total) * 100 : 0;

    return (
      <div
        ref={ref}
        className={cn(
          "sticky bottom-4 z-40 w-full flex flex-col md:flex-row items-center justify-between gap-4 p-4",
          "bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]",
          className
        )}
        {...props}
      >
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <div className="flex justify-between md:justify-start items-center gap-3">
            <span className="font-display font-bold text-sm text-[var(--text-primary)]">
              Validação em Lote
            </span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]">
              {resolvidos}/{total} resolvidos
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full md:w-64 bg-[var(--bg-app)] border border-[var(--border-brutal)] rounded-[var(--radius-pill)] overflow-hidden">
            <div
              className="h-full bg-[var(--status-success-border)] transition-all duration-300"
              style={{ width: `${progressoPct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto justify-end">
          <span className="text-xs text-[var(--text-secondary)] font-medium text-center md:text-right">
            {elegiveisLote > 0
              ? `${elegiveisLote} ${elegiveisLote === 1 ? "item elegível" : "itens elegíveis"} para lote.`
              : "Revisão individual obrigatória (sem itens elegíveis p/ lote)"}
          </span>
          <Button
            type="button"
            variante="primaria"
            disabled={elegiveisLote === 0 || carregando}
            onClick={onAprovarLote}
            className="w-full md:w-auto"
          >
            {carregando ? "Aprovando lote…" : "Aprovar elegíveis em lote"}
          </Button>
        </div>
      </div>
    );
  }
);
