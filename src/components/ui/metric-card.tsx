import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

interface MetricTrend {
  /** Direção da tendência — controla o glifo (▲/▼) e a semântica visual. */
  direcao: "alta" | "baixa";
  /** Valor exibido ao lado do glifo (ex.: 3, "12%"). */
  valor: React.ReactNode;
}

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rótulo superior (eyebrow) em caixa alta. */
  titulo: string;
  /** Número/valor principal do KPI. */
  valor: React.ReactNode;
  /** Badge de tendência opcional exibido ao lado do valor. */
  tendencia?: MetricTrend;
  /** Progresso 0–100 exibido na barra do rodapé. Omitido => sem barra. */
  progresso?: number;
}

/**
 * Cartão de métrica / KPI. Eyebrow + valor grande + badge de tendência
 * opcional + barra de progresso no rodapé. Superfície brutalista (borda
 * âncora + sombra composta) sobre fundo branco.
 */
export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  function MetricCard(
    { className, titulo, valor, tendencia, progresso, ...props },
    ref,
  ) {
    const pct =
      typeof progresso === "number"
        ? Math.max(0, Math.min(100, progresso))
        : null;

    return (
      <div
        ref={ref}
        className={cn(
          surface("solida", {
            className: "bg-[var(--surface-card)] p-[22px]",
          }),
          className,
        )}
        {...props}
      >
        <p className="font-display text-[12px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          {titulo}
        </p>

        <div className="mt-2 flex items-center gap-3">
          <span className="font-display text-[40px] leading-none font-bold text-[var(--text-primary)]">
            {valor}
          </span>

          {tendencia && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border-[1.5px] px-2 py-0.5 text-sm font-semibold",
                tendencia.direcao === "alta"
                  ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                  : "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
              )}
            >
              <span aria-hidden>
                {tendencia.direcao === "alta" ? "▲" : "▼"}
              </span>
              {tendencia.valor}
            </span>
          )}
        </div>

        {pct !== null && (
          <div
            className="mt-4 h-1.5 w-full rounded-[var(--radius-pill)] bg-[var(--bg-app)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-[var(--radius-pill)] bg-[var(--action-primary)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  },
);
