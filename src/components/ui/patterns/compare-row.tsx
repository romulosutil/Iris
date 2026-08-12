import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "../card";
import { Pill } from "../primitives/pill";

export interface CompareRowProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo: string;
  rotuloAnterior?: string;
  valorAnterior: string;
  rotuloAtual?: string;
  valorAtual: string;
  divergente?: boolean;
}

export const CompareRow = React.forwardRef<HTMLDivElement, CompareRowProps>(
  function CompareRow(
    {
      className,
      titulo,
      rotuloAnterior = "Anterior",
      valorAnterior,
      rotuloAtual = "Atual (IA Extraído)",
      valorAtual,
      divergente = false,
      ...props
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]",
          divergente && "border-[var(--status-warning-border)]",
          className
        )}
        {...props}
      >
        {/* Título unificado no topo */}
        <div className="col-span-1 md:col-span-2 flex items-center justify-between pb-2 border-b-2 border-gray-100">
          <span className="font-display font-bold text-base text-[var(--text-primary)]">
            {titulo}
          </span>
          {divergente && (
            <Pill className="bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]">
              Divergente / Inconsistente
            </Pill>
          )}
        </div>

        {/* Coluna Anterior */}
        <div className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] border border-gray-200">
          <span className="text-xs font-mono font-semibold uppercase text-[var(--text-secondary)]">
            {rotuloAnterior}
          </span>
          <p className="text-sm text-[var(--text-primary)] font-medium leading-relaxed break-words">
            {valorAnterior}
          </p>
        </div>

        {/* Coluna Atual */}
        <div
          className={cn(
            "flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] border",
            divergente
              ? "border-[var(--status-error-border)] bg-[var(--status-error-bg)]/10 text-[var(--text-primary)]"
              : "border-gray-200"
          )}
        >
          <span className="text-xs font-mono font-semibold uppercase text-[var(--text-secondary)]">
            {rotuloAtual}
          </span>
          <p className="text-sm text-[var(--text-primary)] font-medium leading-relaxed break-words">
            {valorAtual}
          </p>
        </div>
      </div>
    );
  }
);
