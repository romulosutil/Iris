"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";

export interface RpdGraficoEntry {
  id: string;
  criadoEm: Date | string;
  situacao: string;
  pensamentoAutomatico: string;
  emocao: string;
  intensidade: number;
  distorcaoCognitiva: string;
  respostaRacional: string;
  intensidadePos: number | null;
}

export interface GraficoEvolucaoCrencasProps extends React.HTMLAttributes<HTMLDivElement> {
  entries: RpdGraficoEntry[];
  className?: string;
}

/**
 * GraficoEvolucaoCrencas — Gráfico SVG nativo de Reestruturação Cognitiva TCC.
 * Exibe o acompanhamento temporal da intensidade emocional inicial (pensamento automático)
 * em contraste com a reavaliação de humor pós-resposta racional.
 */
export function GraficoEvolucaoCrencas({
  entries,
  className,
  ...props
}: GraficoEvolucaoCrencasProps) {
  const [ativo, setAtivo] = React.useState<RpdGraficoEntry | null>(null);

  // Ordena por data de criação crescente para a linha do tempo
  const ordenados = React.useMemo(() => {
    return [...entries].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    );
  }, [entries]);

  if (ordenados.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)] bg-[var(--surface-card)] p-8 text-center",
          className,
        )}
        {...props}
      >
        <span className="mb-2 text-3xl">📊</span>
        <p className="font-display font-bold text-[var(--text-primary)]">
          Nenhum registro de pensamentos cadastrado.
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Preencha o formulário de RPD para visualizar o gráfico de
          reestruturação cognitiva e evolução temporal.
        </p>
      </div>
    );
  }

  // Estatísticas de reestruturação
  const total = ordenados.length;
  const mediaInicial = Math.round(
    ordenados.reduce((acc, curr) => acc + curr.intensidade, 0) / total,
  );
  const comPos = ordenados.filter((e) => typeof e.intensidadePos === "number");
  const mediaPos = comPos.length
    ? Math.round(
        comPos.reduce((acc, curr) => acc + (curr.intensidadePos ?? 0), 0) /
          comPos.length,
      )
    : null;
  const reducaoMedia =
    mediaPos !== null ? Math.max(0, mediaInicial - mediaPos) : null;

  // Parâmetros do SVG
  const width = 600;
  const height = 220;
  const paddingX = 45;
  const paddingY = 35;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const coords = ordenados.map((item, idx) => {
    const x =
      ordenados.length === 1
        ? width / 2
        : paddingX + (idx / (ordenados.length - 1)) * innerWidth;
    const yInicial = height - paddingY - (item.intensidade / 100) * innerHeight;
    const yPos =
      item.intensidadePos !== null
        ? height - paddingY - (item.intensidadePos / 100) * innerHeight
        : null;
    return { x, yInicial, yPos, item, idx: idx + 1 };
  });

  const pathInicial = coords.reduce((acc, curr, idx) => {
    return idx === 0
      ? `M ${curr.x} ${curr.yInicial}`
      : `${acc} L ${curr.x} ${curr.yInicial}`;
  }, "");

  const coordsComPos = coords.filter((c) => c.yPos !== null);
  const pathPos = coordsComPos.reduce((acc, curr, idx) => {
    return idx === 0
      ? `M ${curr.x} ${curr.yPos}`
      : `${acc} L ${curr.x} ${curr.yPos}`;
  }, "");

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 text-[var(--text-primary)] shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      {/* Header do Gráfico */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-brutal)]/20 pb-3">
        <div>
          <h4 className="font-display flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <span>📈</span> Gráfico de Reestruturação Cognitiva
          </h4>
          <p className="font-body text-xs text-[var(--text-secondary)]">
            Redução da intensidade emocional disfuncional ao longo dos registros
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill variant="solid" colorScheme="coral" size="sm">
            Média Inicial: {mediaInicial}%
          </Pill>
          {mediaPos !== null ? (
            <Pill variant="solid" colorScheme="menta" size="sm">
              Média Pós-Resposta: {mediaPos}%
            </Pill>
          ) : null}
          {reducaoMedia !== null ? (
            <Pill variant="inset" colorScheme="menta" size="sm">
              ⬇ -{reducaoMedia}% Redução Médias
            </Pill>
          ) : null}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible select-none"
        >
          {/* Linhas de Grade de Fundo (100%, 75%, 50%, 25%, 0%) */}
          {[100, 75, 50, 25, 0].map((val) => {
            const y = height - paddingY - (val / 100) * innerHeight;
            return (
              <g key={val}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray={val === 0 ? undefined : "4 4"}
                  className={cn(
                    val === 0
                      ? "text-[var(--border-brutal)]"
                      : "text-[var(--border-brutal)]/20",
                  )}
                  strokeWidth={val === 0 ? "2" : "1"}
                />
                <text
                  x={paddingX - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[var(--text-secondary)] font-mono text-[10px]"
                >
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Linha da Intensidade Inicial (Coral/Vermelho) */}
          <path
            d={pathInicial}
            fill="none"
            stroke="var(--color-raw-coral-500, #e05252)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Linha da Intensidade Pós-Resposta (Menta/Verde) */}
          {pathPos ? (
            <path
              d={pathPos}
              fill="none"
              stroke="var(--color-raw-mint-500, #14857a)"
              strokeWidth="3"
              strokeDasharray="6 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Conexão Vertical (Queda por evento) */}
          {coords.map(({ x, yInicial, yPos, idx }) => {
            if (yPos === null) return null;
            return (
              <line
                key={`line-${idx}`}
                x1={x}
                y1={yInicial}
                x2={x}
                y2={yPos}
                stroke="var(--color-raw-mint-500, #14857a)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.6"
              />
            );
          })}

          {/* Pontos Interativos */}
          {coords.map(({ x, yInicial, yPos, item, idx }) => {
            const isSelected = ativo?.id === item.id;

            return (
              <g
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`Registro ${idx}: ${item.emocao} (${item.intensidade}% → ${item.intensidadePos ?? "N/A"}%)`}
                onMouseEnter={() => setAtivo(item)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(item)}
                onBlur={() => setAtivo(null)}
                className="cursor-pointer focus:outline-none"
              >
                {/* Ponto Inicial */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={yInicial}
                    r="10"
                    fill="var(--color-raw-coral-500, #e05252)"
                    opacity="0.3"
                  />
                )}
                <circle
                  cx={x}
                  cy={yInicial}
                  r="5"
                  fill="var(--color-raw-coral-500, #e05252)"
                  stroke="#1A1A1A"
                  strokeWidth="2"
                  className="transition-transform duration-100 hover:scale-125"
                />

                {/* Ponto Pós-Resposta */}
                {yPos !== null ? (
                  <>
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={yPos}
                        r="10"
                        fill="var(--color-raw-mint-500, #14857a)"
                        opacity="0.3"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={yPos}
                      r="5"
                      fill="var(--color-raw-mint-500, #14857a)"
                      stroke="#1A1A1A"
                      strokeWidth="2"
                      className="transition-transform duration-100 hover:scale-125"
                    />
                  </>
                ) : null}

                {/* Rótulo Eixo X */}
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-[var(--text-secondary)] font-mono text-[10px]"
                >
                  #{idx}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-brutal)]/20 pt-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full border border-black bg-[var(--color-raw-coral-500,#e05252)]" />
            <span className="font-medium text-[var(--text-secondary)]">
              Intensidade Inicial (Pensamento Automático)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full border border-black bg-[var(--color-raw-mint-500,#14857a)]" />
            <span className="font-medium text-[var(--text-secondary)]">
              Reavaliação de Humor (Pós-Resposta Racional)
            </span>
          </div>
        </div>
      </div>

      {/* Tooltip do Nó Selecionado */}
      {ativo && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-3 text-xs shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-center justify-between border-b border-[var(--border-brutal)]/20 pb-1 font-bold text-[var(--text-primary)]">
            <span>
              Gatilho: &quot;{ativo.situacao}&quot; ({ativo.emocao})
            </span>
            <span className="font-mono text-xs">
              {ativo.intensidade}% → {ativo.intensidadePos ?? "N/A"}%
            </span>
          </div>
          <div>
            <strong className="text-[var(--text-primary)]">
              Pensamento Automático:
            </strong>{" "}
            <span className="text-[var(--text-secondary)] italic">
              &quot;{ativo.pensamentoAutomatico}&quot;
            </span>
          </div>
          <div>
            <strong className="text-[var(--text-primary)]">
              Distorção Cognitiva:
            </strong>{" "}
            <span className="font-semibold text-black">
              {ativo.distorcaoCognitiva}
            </span>
          </div>
          <div>
            <strong className="text-[var(--text-primary)]">
              Resposta Racional:
            </strong>{" "}
            <span className="text-[var(--text-secondary)]">
              &quot;{ativo.respostaRacional}&quot;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
