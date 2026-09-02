import * as React from "react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icon";

export interface CompareRowProps extends React.HTMLAttributes<HTMLDivElement> {
  rotulo: string;
  dadoAnterior: React.ReactNode;
  dadoSugerido: React.ReactNode;
  divergente?: boolean;
  motivoDivergencia?: string;
  dataAnterior?: string;
  dataSugerida?: string;
}

/**
 * CompareRow — Linha de comparação para revisão de divergências e evolução clínica.
 * Exibe dado anterior vs. dado sugerido com indicação visual de consistência.
 */
export function CompareRow({
  rotulo,
  dadoAnterior,
  dadoSugerido,
  divergente = false,
  motivoDivergencia,
  dataAnterior,
  dataSugerida,
  className,
  ...props
}: CompareRowProps) {
  return (
    <div
      data-divergente={divergente}
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] p-3.5 transition-colors",
        divergente
          ? "border-status-warning-border bg-status-warning-bg/10"
          : "border-border-brutal/30 bg-surface-card",
        className,
      )}
      {...props}
    >
      {/* Título do campo e badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-text-primary font-mono text-xs font-bold tracking-wider uppercase">
          {rotulo}
        </span>
        {divergente ? (
          <Pill
            variant="inset"
            colorScheme="ouro"
            size="sm"
            icon={<AlertTriangleIcon size={12} />}
          >
            Divergente
          </Pill>
        ) : (
          <Pill
            variant="solid"
            colorScheme="menta"
            size="sm"
            icon={<CheckIcon size={12} />}
          >
            Consistente
          </Pill>
        )}
      </div>

      {/* Grade de comparação lado a lado */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Dado anterior */}
        <div className="bg-surface-elevated/40 flex flex-col gap-1 rounded p-2.5">
          <span className="text-text-secondary text-xs font-medium">
            Histórico Anterior {dataAnterior ? `(${dataAnterior})` : ""}
          </span>
          <div className="text-text-primary text-sm font-medium">
            {dadoAnterior}
          </div>
        </div>

        {/* Dado sugerido */}
        <div
          className={cn(
            "flex flex-col gap-1 rounded p-2.5",
            divergente
              ? "border-status-warning-border bg-status-warning-bg/20 border border-dashed"
              : "bg-surface-elevated/40",
          )}
        >
          <span className="text-text-secondary text-xs font-medium">
            Nova Sugestão {dataSugerida ? `(${dataSugerida})` : ""}
          </span>
          <div className="text-text-primary text-sm font-semibold">
            {dadoSugerido}
          </div>
        </div>
      </div>

      {/* Motivo da divergência */}
      {divergente && motivoDivergencia && (
        <p className="text-text-secondary mt-1 text-xs">
          <span className="text-status-warning-fg font-semibold">
            Atenção:{" "}
          </span>
          {motivoDivergencia}
        </p>
      )}
    </div>
  );
}
