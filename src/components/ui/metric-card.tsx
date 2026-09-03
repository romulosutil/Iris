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
  /**
   * Selo de classificação alinhado ao rótulo (canto superior direito).
   * Recebe um nó pronto — na prática um `<Pill>` do DS, para que a cor venha
   * do `colorScheme` dele e o chamador nunca precise abrir paleta. Diferente
   * de `tendencia`, que é o delta do próprio número.
   */
  selo?: React.ReactNode;
  /**
   * Linha de rodapé com a ressalva do número (unidade, recorte, o que ele NÃO
   * mede). Existe para que um KPI ambíguo carregue a ressalva junto do valor
   * em vez de deixá-la num parágrafo distante.
   */
  descricao?: React.ReactNode;
  /**
   * Destaca o cartão principal de uma grade. O canal é a BORDA em
   * `--action-primary` mais um degrau de elevação — nunca um fundo diferente:
   * fundo colorido brigaria com os tints semânticos de status.
   */
  destaque?: boolean;
  /**
   * Peso tipográfico do valor. `hero` (40px, padrão) é o número curto de
   * dashboard. `compacta` (28px) existe para valor LONGO em grade densa —
   * moeda formatada ("R$ 12.345,67") estoura a coluna no peso hero e o número
   * vira duas linhas ou vaza do cartão.
   */
  densidade?: "hero" | "compacta";
}

/**
 * Cartão de métrica / KPI. Eyebrow + valor grande + badge de tendência
 * opcional + barra de progresso no rodapé. Superfície brutalista (borda
 * âncora + sombra composta) sobre fundo branco.
 */
export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  function MetricCard(
    {
      className,
      titulo,
      valor,
      tendencia,
      progresso,
      selo,
      descricao,
      destaque = false,
      densidade = "hero",
      ...props
    },
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
            elevation: destaque ? "hover" : "base",
            className: cn(
              "bg-[var(--surface-card)] p-[22px]",
              destaque && "border-[var(--action-primary)]",
            ),
          }),
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[12px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
            {titulo}
          </p>
          {selo ? <span className="shrink-0">{selo}</span> : null}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <span
            className={cn(
              "font-display leading-none font-bold text-[var(--text-primary)]",
              densidade === "compacta" ? "text-[28px]" : "text-[40px]",
            )}
          >
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

        {descricao ? (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {descricao}
          </p>
        ) : null}

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
