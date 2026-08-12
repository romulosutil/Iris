"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { SparkleIcon, CheckIcon, ClockIcon } from "./icon";
import { Pill } from "./primitives/pill";

// Dense Hatching Background Style for AI suggestions
const aiHatchStyle = {
  background: "repeating-linear-gradient(-45deg, #f3e8ff, #f3e8ff 3px, #6a4c93 3px, #6a4c93 6px)",
};

export interface ProgressBarChartProps {
  titulo: string;
  totalAlvos: number;
  conquistadosContagem: number;
  sugeridosContagem: number;
  trendBadgeTexto?: string; // e.g. "+3 esta semana"
  className?: string;
}

export function ProtocolProgressBarChart({
  titulo,
  totalAlvos,
  conquistadosContagem,
  sugeridosContagem,
  trendBadgeTexto,
  className,
}: ProgressBarChartProps) {
  const conquistadosPercent = (conquistadosContagem / totalAlvos) * 100;
  const sugeridosPercent = (sugeridosContagem / totalAlvos) * 100;
  const restantePercent = 100 - conquistadosPercent - sugeridosPercent;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-5 bg-white border-2 border-[#1A1A1A] rounded-[8px] shadow-[4px_4px_0px_#1A1A1A]",
        className
      )}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-bold text-base text-[#1A1A1A]">
          {titulo}
        </h3>
        {trendBadgeTexto && (
          <span className="font-mono text-xs font-black uppercase text-[#1A1A1A] bg-[#B2DFDB] border border-[#1A1A1A] px-2 py-0.5 rounded-sm shadow-[1.5px_1.5px_0px_#1A1A1A]">
            {trendBadgeTexto}
          </span>
        )}
      </div>

      {/* Progress Bar Container */}
      <div className="relative h-7 w-full bg-gray-100 border-2 border-[#1A1A1A] rounded-[4px] overflow-hidden flex">
        {/* Conquistados (Sólido Menta) */}
        {conquistadosPercent > 0 && (
          <div
            style={{ width: `${conquistadosPercent}%` }}
            className="h-full bg-[#B2DFDB] border-r border-[#1A1A1A]"
            title={`${conquistadosContagem} metas conquistadas (${Math.round(conquistadosPercent)}%)`}
          />
        )}
        {/* Sugeridos (Hachurado Violeta) */}
        {sugeridosPercent > 0 && (
          <div
            style={{
              width: `${sugeridosPercent}%`,
              ...aiHatchStyle,
            }}
            className="h-full border-r border-[#1A1A1A]"
            title={`${sugeridosContagem} metas sugeridas por IA (${Math.round(sugeridosPercent)}%)`}
          />
        )}
        {/* Restante */}
        {restantePercent > 0 && (
          <div style={{ width: `${restantePercent}%` }} className="h-full bg-transparent" />
        )}
      </div>

      {/* Legends and Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono pt-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="size-3.5 border border-[#1A1A1A] bg-[#B2DFDB] rounded-sm shrink-0" />
            <span className="text-[#1A1A1A] font-bold">
              {conquistadosContagem} Dominadas
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              style={aiHatchStyle}
              className="size-3.5 border border-[#1A1A1A] rounded-sm shrink-0"
            />
            <span className="text-[#6A4C93] font-bold">
              {sugeridosContagem} Sugeridas por IA
            </span>
          </div>
        </div>
        <span className="text-gray-500 font-bold">
          Total: {totalAlvos} Metas
        </span>
      </div>
    </div>
  );
}

export interface TrendPoint {
  sessao: string;
  valor: number;
  info?: string;
  conquista?: boolean;
}

export interface TrendChartProps {
  titulo: string;
  dados: TrendPoint[];
  className?: string;
}

export function ProtocolTrendChart({ titulo, dados, className }: TrendChartProps) {
  const [activePoint, setActivePoint] = React.useState<TrendPoint | null>(null);

  // SVG dimensions
  const width = 500;
  const height = 200;
  const padding = 30;

  const pointsCount = dados.length;
  const maxVal = Math.max(...dados.map((d) => d.valor), 10);
  const minVal = 0;

  // Calculate coordinates
  const getX = React.useCallback((index: number) => {
    if (pointsCount <= 1) return width / 2;
    return padding + (index * (width - 2 * padding)) / (pointsCount - 1);
  }, [pointsCount, width, padding]);

  const getY = React.useCallback((value: number) => {
    return height - padding - ((value - minVal) * (height - 2 * padding)) / (maxVal - minVal);
  }, [height, padding, minVal, maxVal]);

  // Generate SVG path string
  const pathD = React.useMemo(() => {
    if (dados.length === 0) return "";
    return dados
      .map((d, i) => {
        const prefix = i === 0 ? "M" : "L";
        return `${prefix} ${getX(i)} ${getY(d.valor)}`;
      })
      .join(" ");
  }, [dados, getX, getY]);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-5 bg-white border-2 border-[#1A1A1A] rounded-[8px] shadow-[4px_4px_0px_#1A1A1A] relative",
        className
      )}
    >
      <h3 className="font-display font-bold text-base text-[#1A1A1A]">
        {titulo}
      </h3>

      <div className="relative w-full overflow-hidden">
        {/* Tooltip Interativo */}
        {activePoint && (
          <div className="absolute top-1 right-1 z-30 bg-[#1A1A1A] text-white text-[11px] p-2 rounded-sm border border-black shadow-[2px_2px_0px_var(--action-primary)] font-mono animate-fade-in max-w-[200px]">
            <div className="font-bold text-[var(--action-primary)] uppercase">
              {activePoint.sessao}
            </div>
            <div>Escore: {activePoint.valor}%</div>
            {activePoint.info && <div className="text-gray-300 mt-0.5">{activePoint.info}</div>}
          </div>
        )}

        {/* SVG Nativo */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto border border-gray-200 rounded bg-gray-50"
        >
          {/* Grid lines */}
          <line
            x1={padding}
            y1={getY(0)}
            x2={width - padding}
            y2={getY(0)}
            stroke="#1A1A1A"
            strokeWidth="2"
          />
          <line
            x1={padding}
            y1={getY(maxVal / 2)}
            x2={width - padding}
            y2={getY(maxVal / 2)}
            stroke="#e5e7eb"
            strokeDasharray="4 4"
          />
          <line
            x1={padding}
            y1={getY(maxVal)}
            x2={width - padding}
            y2={getY(maxVal)}
            stroke="#e5e7eb"
            strokeDasharray="4 4"
          />

          {/* SVG Connection Line */}
          {dados.length > 0 && (
            <path
              d={pathD}
              fill="none"
              stroke="#1A1A1A"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Nodes */}
          {dados.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.valor);
            const isConquista = d.conquista;

            return (
              <g
                key={i}
                onMouseEnter={() => setActivePoint(d)}
                onMouseLeave={() => setActivePoint(null)}
                tabIndex={0}
                onFocus={() => setActivePoint(d)}
                onBlur={() => setActivePoint(null)}
                className="cursor-pointer focus:outline-none"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isConquista ? "8" : "6"}
                  fill={isConquista ? "#F2B705" : "#1A1A1A"}
                  stroke="#1A1A1A"
                  strokeWidth="2.5"
                  className="transition-transform duration-100 hover:scale-125"
                />
                {isConquista && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="3"
                    fill="white"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* X Axis Labels */}
      <div className="flex justify-between text-[10px] font-mono font-bold text-gray-500 px-6">
        <span>{dados[0]?.sessao || "Início"}</span>
        <span>Sessões Temporais (1 a N)</span>
        <span>{dados[dados.length - 1]?.sessao || "Fim"}</span>
      </div>
    </div>
  );
}
