"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface FaixaJanela {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
}

export interface BloqueioData {
  dataInicio: string;
  dataFim: string;
}

export interface BlocoAgendaItem {
  id: string;
  diaSemana: number;
  inicioMin: number;
  duracaoMin: number;
  rotulo: string;
  disciplina: string;
  origem: "previsto" | "conflito" | "concreto";
  recorrenteId?: string;
}

export interface ScheduleGridProps {
  dias: string[];
  passoMin?: number;
  abertura?: string;
  fechamento?: string;
  janelas?: FaixaJanela[];
  bloqueios?: BloqueioData[];
  blocos?: BlocoAgendaItem[];
  aoAlocar?: (diaSemana: number, inicioMin: number) => void;
  aoAbrirRegra?: (regraId: string, rotulo: string) => void;
}

const DIAS_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const LARGURA_ROTULO_REM = 6; // 96px (w-24)
const LARGURA_COL_REM = 3.5; // 56px per slot column for comfortable touch targets

function horaParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function minParaHora(m: number): string {
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function colunasDaGrade(passoMin: number, abertura: string, fechamento: string): string[] {
  const inicio = horaParaMin(abertura);
  const fim = horaParaMin(fechamento);
  const cols: string[] = [];
  for (let m = inicio; m < fim; m += passoMin) {
    cols.push(minParaHora(m));
  }
  return cols;
}

export function ScheduleGrid({
  dias,
  passoMin = 30,
  abertura = "08:00",
  fechamento = "18:00",
  janelas = [],
  bloqueios = [],
  blocos = [],
  aoAlocar,
  aoAbrirRegra,
}: ScheduleGridProps) {
  const colunas = React.useMemo(
    () => colunasDaGrade(passoMin, abertura, fechamento),
    [passoMin, abertura, fechamento],
  );

  const [foco, setFoco] = React.useState<{ linha: number; col: number }>({ linha: 0, col: 0 });
  const refs = React.useRef(new Map<string, HTMLDivElement | null>());

  function dentroDaJanela(diaSemana: number, inicioMin: number) {
    if (janelas.length === 0) return true;
    return janelas.some(
      (j) =>
        j.diaSemana === diaSemana &&
        inicioMin >= horaParaMin(j.horaInicio) &&
        inicioMin < horaParaMin(j.horaFim),
    );
  }

  function estaBloqueado(diaISO: string) {
    return bloqueios.some((b) => diaISO >= b.dataInicio && diaISO <= b.dataFim);
  }

  function chaveRef(linha: number, col: number) {
    return `${linha}-${col}`;
  }

  function focarCelula(linha: number, col: number) {
    const l = Math.max(0, Math.min(dias.length - 1, linha));
    const c = Math.max(0, Math.min(colunas.length - 1, col));
    setFoco({ linha: l, col: c });
    refs.current.get(chaveRef(l, c))?.focus();
  }

  function aoTeclar(
    e: React.KeyboardEvent,
    linha: number,
    col: number,
    diaSemana: number,
    inicioMin: number,
    bloqueado: boolean,
  ) {
    const destinos: Record<string, [number, number]> = {
      ArrowRight: [linha, col + 1],
      ArrowLeft: [linha, col - 1],
      ArrowDown: [linha + 1, col],
      ArrowUp: [linha - 1, col],
    };
    const alvo = destinos[e.key];
    if (alvo) {
      e.preventDefault();
      focarCelula(alvo[0], alvo[1]);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !bloqueado) {
      e.preventDefault();
      aoAlocar?.(diaSemana, inicioMin);
    }
  }

  return (
    <div
      role="grid"
      aria-label="Calendário semanal"
      className="w-full overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)] p-3"
    >
      {/* Cabeçalho de Colunas / Horários */}
      <div role="row" className="flex items-center border-b-2 border-[var(--border-brutal)] pb-2 mb-2">
        <div
          role="columnheader"
          className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] px-2"
          style={{ width: `${LARGURA_ROTULO_REM}rem` }}
        >
          Dia / Hora
        </div>
        {colunas.map((c) => (
          <div
            key={c}
            role="columnheader"
            className="shrink-0 text-center font-mono text-xs font-semibold text-[var(--text-secondary)]"
            style={{ width: `${LARGURA_COL_REM}rem` }}
          >
            {c}
          </div>
        ))}
      </div>

      {/* Linhas de Dias da Semana */}
      <div className="flex flex-col gap-1.5">
        {dias.map((diaISO, linha) => {
          const diaSemana = new Date(`${diaISO}T00:00:00Z`).getUTCDay();
          const bloqueado = estaBloqueado(diaISO);

          return (
            <div role="row" key={diaISO} className="relative flex items-center">
              <div
                role="rowheader"
                className="shrink-0 font-display text-sm font-bold text-[var(--text-primary)] px-2"
                style={{ width: `${LARGURA_ROTULO_REM}rem` }}
              >
                {DIAS_LABEL[diaSemana]}
              </div>

              {colunas.map((coluna, col) => {
                const inicioMin = horaParaMin(coluna);
                const ehFoco = foco.linha === linha && foco.col === col;
                const foraJanela = !dentroDaJanela(diaSemana, inicioMin);
                const blocoQueComeca = blocos.find(
                  (b) => b.diaSemana === diaSemana && b.inicioMin === inicioMin,
                );

                const rotuloCelula = blocoQueComeca
                  ? `${DIAS_LABEL[diaSemana]} ${coluna}, ocupado: ${blocoQueComeca.rotulo}, ${blocoQueComeca.disciplina}`
                  : `${DIAS_LABEL[diaSemana]} ${coluna}`;

                return (
                  <div
                    key={coluna}
                    role="gridcell"
                    aria-label={rotuloCelula}
                    aria-disabled={bloqueado}
                    tabIndex={ehFoco ? 0 : -1}
                    ref={(el) => {
                      refs.current.set(chaveRef(linha, col), el);
                    }}
                    onFocus={() => setFoco({ linha, col })}
                    onClick={() => !bloqueado && aoAlocar?.(diaSemana, inicioMin)}
                    onKeyDown={(e) => aoTeclar(e, linha, col, diaSemana, inicioMin, bloqueado)}
                    className={cn(
                      "h-11 shrink-0 m-0.5 border border-[var(--border-brutal)]/20 rounded-[var(--radius-xs)] transition-colors cursor-pointer",
                      "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                      bloqueado
                        ? "bg-[var(--status-error-bg)]/20 cursor-not-allowed border-dashed"
                        : "bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] hover:border-[var(--border-brutal)]",
                      foraJanela && !bloqueado && "opacity-40 bg-[var(--surface-elevated)]",
                    )}
                    style={{ width: `${LARGURA_COL_REM}rem` }}
                  />
                );
              })}

              {/* Overlays dos Blocos da Agenda */}
              {blocos
                .filter((b) => b.diaSemana === diaSemana)
                .map((b) => {
                  const base = horaParaMin(abertura);
                  const colunasOffset = (b.inicioMin - base) / passoMin;
                  const colunasLargura = b.duracaoMin / passoMin;

                  const estilo = {
                    left: `calc(${LARGURA_ROTULO_REM}rem + ${colunasOffset} * (${LARGURA_COL_REM}rem + 0.25rem))`,
                    width: `calc(${colunasLargura} * (${LARGURA_COL_REM}rem + 0.25rem) - 0.25rem)`,
                  };

                  const classesBloco = cn(
                    "absolute top-0.5 h-10 overflow-hidden px-2 py-1 text-xs font-semibold rounded-[var(--radius-xs)] flex items-center justify-between gap-1 shadow-sm transition-transform active:scale-[0.98]",
                    b.origem === "previsto" &&
                      "bg-[var(--status-ia-bg)] text-[var(--text-primary)] border-2 border-dashed border-[var(--status-ia-border)]",
                    b.origem === "conflito" &&
                      "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-2 border-dashed border-[var(--status-error-border)]",
                    b.origem === "concreto" &&
                      "bg-[var(--action-primary)] text-[var(--action-primary-fg)] border-2 border-[var(--border-brutal)]",
                  );

                  if (b.recorrenteId) {
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => aoAbrirRegra?.(b.recorrenteId!, b.rotulo)}
                        className={cn(classesBloco, "text-left cursor-pointer")}
                        style={estilo}
                      >
                        <span className="truncate">{b.rotulo}</span>
                        <span className="font-mono text-[10px] uppercase opacity-80 shrink-0">
                          {b.disciplina}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div key={b.id} className={classesBloco} style={estilo}>
                      <span className="truncate">{b.rotulo}</span>
                      <span className="font-mono text-[10px] uppercase opacity-80 shrink-0">
                        {b.disciplina}
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
