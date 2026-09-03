"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";
import { CheckIcon, SparkleIcon } from "@/components/ui/icon";

export interface ProtocolProgressData {
  protocoloNome: string;
  totalMetas: number;
  metasDominadas: number;
  metasSugeridasIA: number;
  tendenciaSemanal?: number; // Ex: +3
}

export interface ProtocolProgressBarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: ProtocolProgressData;
  className?: string;
}

/**
 * ProtocolProgressBarChart — Barra de progresso do protocolo com hachura densa de IA.
 * Estilo Soft Neubrutalism sem bibliotecas externas pesadas.
 */
export function ProtocolProgressBarChart({
  data,
  className,
  ...props
}: ProtocolProgressBarChartProps) {
  const {
    protocoloNome,
    totalMetas,
    metasDominadas,
    metasSugeridasIA,
    tendenciaSemanal,
  } = data;

  const total = Math.max(totalMetas, 1);
  const pctDominadas = Math.min(
    Math.round((metasDominadas / total) * 100),
    100,
  );
  const pctSugeridas = Math.min(
    Math.round((metasSugeridasIA / total) * 100),
    100 - pctDominadas,
  );
  const pctRestante = Math.max(100 - pctDominadas - pctSugeridas, 0);

  return (
    <div
      className={cn(
        "border-border-brutal bg-surface-card text-text-primary flex flex-col gap-2.5 rounded-[var(--radius-control)] border-2 p-4 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      {/* Título do Protocolo e Tendência */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-text-primary text-sm font-bold">
            {protocoloNome}
          </span>
          <span className="text-text-secondary font-mono text-xs">
            ({metasDominadas + metasSugeridasIA}/{totalMetas} metas)
          </span>
        </div>

        {typeof tendenciaSemanal === "number" && (
          <Pill
            variant="solid"
            colorScheme={tendenciaSemanal >= 0 ? "menta" : "coral"}
            size="sm"
          >
            {tendenciaSemanal >= 0 ? `+${tendenciaSemanal}` : tendenciaSemanal}{" "}
            esta semana
          </Pill>
        )}
      </div>

      {/* Barra de Progresso Dividida */}
      <div
        role="progressbar"
        aria-valuenow={metasDominadas}
        aria-valuemin={0}
        aria-valuemax={totalMetas}
        aria-label={`Progresso do protocolo ${protocoloNome}`}
        className="border-border-brutal bg-surface-elevated relative flex h-6 w-full overflow-hidden rounded-md border-2"
      >
        {/* Segmento Sólido: Metas Dominadas */}
        {pctDominadas > 0 && (
          <div
            style={{ width: `${pctDominadas}%` }}
            className="text-ink-anchor flex h-full items-center justify-center bg-[var(--status-success-bg)] transition-all duration-300"
            title={`${metasDominadas} metas dominadas (${pctDominadas}%)`}
          >
            {pctDominadas >= 12 && (
              <span className="truncate px-1 font-mono text-xs font-bold">
                {metasDominadas}
              </span>
            )}
          </div>
        )}

        {/* Segmento Hachurado Denso: Metas Sugeridas por IA */}
        {pctSugeridas > 0 && (
          <div
            style={{
              width: `${pctSugeridas}%`,
              background: `repeating-linear-gradient(-45deg, var(--color-raw-violet-100, #f1e9f6), var(--color-raw-violet-100, #f1e9f6) 3px, var(--color-raw-violet-500, #6a4c93) 3px, var(--color-raw-violet-500, #6a4c93) 6px)`,
            }}
            className="border-border-brutal/40 flex h-full items-center justify-center border-l transition-all duration-300"
            title={`${metasSugeridasIA} sugestões IA candidatas a domínio (${pctSugeridas}%)`}
          >
            {pctSugeridas >= 12 && (
              <span className="bg-surface-card/90 text-status-ia-fg truncate rounded px-1 font-mono text-xs font-bold">
                +{metasSugeridasIA}
              </span>
            )}
          </div>
        )}

        {/* Segmento Restante */}
        {pctRestante > 0 && (
          <div
            style={{ width: `${pctRestante}%` }}
            className="bg-surface-elevated/40 h-full"
            title={`${totalMetas - metasDominadas - metasSugeridasIA} metas a desenvolver`}
          />
        )}
      </div>

      {/* Legenda Exata */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="border-border-brutal size-3 rounded-xs border bg-[var(--status-success-bg)]" />
          <span className="text-text-secondary">
            <strong className="text-text-primary">{metasDominadas}</strong>{" "}
            Dominadas
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="border-status-ia-border size-3 rounded-xs border"
            style={{
              background: `repeating-linear-gradient(-45deg, #f1e9f6, #f1e9f6 2px, #6a4c93 2px, #6a4c93 4px)`,
            }}
          />
          <span className="text-text-secondary">
            <strong className="text-text-primary">{metasSugeridasIA}</strong>{" "}
            Candidatas IA
          </span>
        </div>

        <div className="text-text-secondary font-mono text-xs font-semibold">
          {pctDominadas + pctSugeridas}% Total
        </div>
      </div>
    </div>
  );
}

export interface TrendSessionPoint {
  sessaoNumero: number;
  sessaoData?: string;
  evidenciasAcumuladas: number;
  conquistasNoDia?: number;
  descricaoDestaque?: string;
}

export interface ProtocolTrendChartProps extends React.HTMLAttributes<HTMLDivElement> {
  pontos: TrendSessionPoint[];
  titulo?: string;
  protocoloNome?: string;
  className?: string;
}

/**
 * ProtocolTrendChart — Trajetória temporal de evolução entre sessões em SVG puro.
 */
export function ProtocolTrendChart({
  pontos,
  titulo = "Trajetória de Evolução por Sessão",
  protocoloNome,
  className,
  ...props
}: ProtocolTrendChartProps) {
  const [pontoAtivo, setPontoAtivo] = React.useState<TrendSessionPoint | null>(
    null,
  );

  if (pontos.length === 0) {
    return (
      <div className="border-border-brutal bg-surface-card flex flex-col items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed p-8 text-center">
        <p className="font-display text-text-primary font-semibold">
          Nenhum dado de evolução registrado.
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...pontos.map((p) => p.evidenciasAcumuladas), 10);
  const minVal = 0;

  const width = 500;
  const height = 180;
  const paddingX = 40;
  const paddingY = 30;

  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const coords = pontos.map((p, idx) => {
    const x =
      pontos.length === 1
        ? width / 2
        : paddingX + (idx / (pontos.length - 1)) * innerWidth;
    const y =
      height -
      paddingY -
      ((p.evidenciasAcumuladas - minVal) / (maxVal - minVal)) * innerHeight;
    return { x, y, ponto: p };
  });

  const pathD = coords.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, "");

  const areaD =
    coords.length > 0
      ? `${pathD} L ${coords[coords.length - 1]!.x} ${height - paddingY} L ${coords[0]!.x} ${height - paddingY} Z`
      : "";

  return (
    <div
      className={cn(
        "border-border-brutal bg-surface-card text-text-primary flex flex-col gap-3 rounded-[var(--radius-control)] border-2 p-4 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      {/* Header do Gráfico */}
      <div className="border-border-brutal/20 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div>
          <h4 className="font-display text-text-primary text-sm font-bold">
            {titulo}
          </h4>
          {protocoloNome && (
            <span className="text-text-secondary font-mono text-xs uppercase">
              {protocoloNome}
            </span>
          )}
        </div>

        {pontoAtivo && (
          <div className="bg-surface-elevated flex items-center gap-2 rounded px-2 py-1 text-xs">
            <span className="text-text-primary font-bold">
              Sessão {pontoAtivo.sessaoNumero}:
            </span>
            <span className="text-status-success-fg font-mono font-semibold">
              {pontoAtivo.evidenciasAcumuladas} evidências
            </span>
            {pontoAtivo.conquistasNoDia ? (
              <Pill variant="solid" colorScheme="menta" size="sm">
                +{pontoAtivo.conquistasNoDia}
              </Pill>
            ) : null}
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible select-none"
        >
          {/* Linhas de Grade de Fundo */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="currentColor"
            strokeDasharray="4 4"
            className="text-border-brutal/20"
          />
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="currentColor"
            strokeDasharray="4 4"
            className="text-border-brutal/20"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="currentColor"
            className="text-border-brutal/50"
            strokeWidth="2"
          />

          {/* Área Suave */}
          <path
            d={areaD}
            fill="var(--color-raw-mint-100, #e6f4f1)"
            opacity="0.6"
          />

          {/* Linha Principal */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--color-raw-mint-500, #14857a)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Nós de Conquista Interativos */}
          {coords.map(({ x, y, ponto }) => {
            const hasConquista = Boolean(
              ponto.conquistasNoDia && ponto.conquistasNoDia > 0,
            );
            const isSelected = pontoAtivo?.sessaoNumero === ponto.sessaoNumero;

            return (
              <g
                key={ponto.sessaoNumero}
                tabIndex={0}
                role="button"
                aria-label={`Sessão ${ponto.sessaoNumero}: ${ponto.evidenciasAcumuladas} evidências acumuladas`}
                onMouseEnter={() => setPontoAtivo(ponto)}
                onMouseLeave={() => setPontoAtivo(null)}
                onFocus={() => setPontoAtivo(ponto)}
                onBlur={() => setPontoAtivo(null)}
                className="cursor-pointer focus:outline-none"
              >
                {/* Halo de foco/hover */}
                {isSelected && (
                  <circle
                    cx={x}
                    y={y}
                    r="10"
                    fill="var(--color-raw-mint-700, #80cbc4)"
                    opacity="0.4"
                  />
                )}

                {/* Nó Principal */}
                <circle
                  cx={x}
                  cy={y}
                  r={hasConquista ? "6.5" : "5"}
                  fill={
                    hasConquista
                      ? "var(--color-raw-gold-500, #f2b705)"
                      : "var(--color-raw-mint-500, #14857a)"
                  }
                  stroke="#1A1A1A"
                  strokeWidth="2"
                  className="transition-transform duration-100 hover:scale-125"
                />

                {/* Rótulo do Eixo X */}
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="text-text-secondary fill-current font-mono text-xs"
                >
                  S{ponto.sessaoNumero}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detalhe do Nó Selecionado */}
      {pontoAtivo?.descricaoDestaque && (
        <div className="border-border-brutal/30 bg-surface-elevated/40 text-text-secondary rounded border p-2 text-xs">
          <span className="text-text-primary font-semibold">Destaque: </span>
          {pontoAtivo.descricaoDestaque}
        </div>
      )}
    </div>
  );
}
