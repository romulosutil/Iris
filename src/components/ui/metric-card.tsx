import * as React from "react";
import { cn } from "@/lib/cn";

export interface MetricTrend {
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
          "border-[1.5px] border-[color:var(--ink-anchor)] bg-[color:var(--color-bg-surface)]",
          "rounded-[var(--radius-md)] p-[22px] shadow-[var(--shadow-composite)]",
          className,
        )}
        {...props}
      >
        <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-graphite)]">
          {titulo}
        </p>

        <div className="mt-2 flex items-center gap-3">
          <span className="font-display text-[40px] font-bold leading-none text-[color:var(--ink-anchor)]">
            {valor}
          </span>

          {tendencia && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border-[1.5px] px-2 py-0.5",
                "border-[color:var(--success-accent)] bg-[color:var(--success-tint)] text-[color:var(--success-deep)]",
                "text-sm font-semibold",
              )}
            >
              <span aria-hidden>{tendencia.direcao === "alta" ? "▲" : "▼"}</span>
              {tendencia.valor}
            </span>
          )}
        </div>

        {pct !== null && (
          <div
            className="mt-4 h-1.5 w-full rounded-[var(--radius-pill)] bg-[color:var(--color-raw-gray-100)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-[var(--radius-pill)] bg-[color:var(--brand-primary)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  },
);
