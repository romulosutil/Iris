"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { colunasDaGrade } from "@/lib/agenda/grade";
import { horaParaMin, minParaHora, type FaixaDia } from "@/lib/agenda/janela";
import type { BlocoAgenda } from "@/lib/agenda/projecao";

const DIAS_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const LARGURA_ROTULO_REM = 6; // w-24
const LARGURA_COL_REM = 3; // w-12
const FOCO =
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";

export interface CalendarioSemanaProps {
  dias: string[];
  passoMin: number;
  abertura: string;
  fechamento: string;
  janelas: FaixaDia[];
  bloqueios: { dataInicio: string; dataFim: string }[];
  blocos: BlocoAgenda[];
  aoAlocar: (diaSemana: number, inicioMin: number) => void;
  /** Etapa D (F2/F4/F5): abre o popover de detalhe/ações da regra de origem
   * do bloco. Só chamado para blocos com `recorrenteId` — avulsa pura fica
   * não-interativa (aria-hidden). */
  aoAbrirRegra?: (regraId: string, rotulo: string) => void;
}

export function CalendarioSemana({
  dias,
  passoMin,
  abertura,
  fechamento,
  janelas,
  bloqueios,
  blocos,
  aoAlocar,
  aoAbrirRegra,
}: CalendarioSemanaProps) {
  const colunas = colunasDaGrade(passoMin, abertura, fechamento); // "HH:MM" por coluna
  const [foco, setFoco] = useState<{ linha: number; col: number }>({ linha: 0, col: 0 });
  const refs = useRef(new Map<string, HTMLDivElement | null>());

  function dentroDaJanela(diaSemana: number, inicioMin: number) {
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
      aoAlocar(diaSemana, inicioMin);
    }
  }

  return (
    <div
      role="grid"
      aria-label="Calendário semanal"
      className="border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] overflow-x-auto p-2"
    >
      <div role="row" className="flex border-b-2 border-[var(--border-brutal)] pb-1 mb-1 bg-[var(--surface-elevated)]/50 rounded-t-[var(--radius-xs)]">
        <div className="shrink-0 p-1 font-display text-[11px] font-bold uppercase text-[var(--text-secondary)] tracking-wider flex items-center justify-start pl-1" style={{ width: `${LARGURA_ROTULO_REM}rem` }}>
          Dia / Data
        </div>
        {colunas.map((c) => {
          const ehHoraCheia = c.endsWith(":00");
          return (
            <div
              key={c}
              role="columnheader"
              className={cn(
                "font-mono w-12 shrink-0 border-l border-[var(--border-brutal)]/20 text-center text-[11px] py-1 transition-colors",
                ehHoraCheia ? "font-bold text-[var(--text-primary)] bg-[var(--surface-card)]" : "font-normal text-[var(--text-secondary)]"
              )}
            >
              {c}
            </div>
          );
        })}
      </div>
      {dias.map((diaISO, linha) => {
        const diaSemana = new Date(`${diaISO}T00:00:00Z`).getUTCDay();
        const bloqueado = estaBloqueado(diaISO);
        const [, mes, dia] = diaISO.split("-");
        const dataFormatada = `${dia}/${mes}`;
        return (
          <div role="row" key={diaISO} className="relative flex items-stretch py-0.5">
            <div
              role="rowheader"
              className="font-display text-[var(--text-primary)] flex shrink-0 flex-col justify-center text-xs font-bold pr-2"
              style={{ width: `${LARGURA_ROTULO_REM}rem` }}
            >
              <span className="uppercase text-[var(--text-primary)] font-extrabold text-xs">{DIAS_LABEL[diaSemana]}</span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)] font-medium">{dataFormatada}</span>
            </div>
            {colunas.map((coluna, col) => {
              const inicioMin = horaParaMin(coluna);
              const ehFoco = foco.linha === linha && foco.col === col;
              const foraJanela = !dentroDaJanela(diaSemana, inicioMin);
              // Bloco que COMEÇA nesta célula (mesmo dia + mesmo horário de
              // início) — a ocupação some do overlay (aria-hidden, decorativo)
              // p/ leitor de tela, então dobra a informação no nome acessível
              // da célula onde o bloco nasce.
              const blocoQueComeca = blocos.find(
                (b) => b.diaSemana === diaSemana && b.inicioMin === inicioMin,
              );
              const rotuloCelula = blocoQueComeca
                ? `${DIAS_LABEL[diaSemana]} ${coluna}, ocupado: ${blocoQueComeca.rotulo}, ${blocoQueComeca.disciplina} (${blocoQueComeca.origem === "previsto" ? "previsto" : "concreto"})`
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
                  onClick={() => !bloqueado && aoAlocar(diaSemana, inicioMin)}
                  onKeyDown={(e) => aoTeclar(e, linha, col, diaSemana, inicioMin, bloqueado)}
                  className={cn(
                    "border-border-brutal/20 h-11 w-12 shrink-0 border-l transition-all",
                    FOCO,
                    bloqueado
                      ? "bg-[var(--color-terracotta)]/15 cursor-not-allowed"
                      : "bg-[var(--surface-card)] hover:bg-[var(--action-primary)]/20 hover:border-2 hover:border-[var(--border-brutal)] cursor-pointer",
                    foraJanela && !bloqueado && "bg-[var(--color-gold)]/10",
                  )}
                />
              );
            })}
            {/* Overlay absoluto: blocos posicionados em unidades fixas (mesma unidade
                das colunas w-12/LARGURA_COL_REM), não em % da linha — a linha
                inclui o rótulo (6rem) + colunas de 3rem, então % da linha ≠ % das
                colunas (C3). */}
            {blocos
              .filter((b) => b.diaSemana === diaSemana)
              .map((b) => {
                const base = horaParaMin(abertura);
                const colunasOffset = (b.inicioMin - base) / passoMin;
                const colunasLargura = b.duracaoMin / passoMin;
                const estilo = {
                  left: `calc(${LARGURA_ROTULO_REM}rem + ${colunasOffset} * ${LARGURA_COL_REM}rem)`,
                  width: `calc(${colunasLargura} * ${LARGURA_COL_REM}rem)`,
                };
                const classesBloco = cn(
                  "absolute top-0.5 bottom-0.5 rounded-[var(--radius-xs)] overflow-hidden px-2 text-xs flex flex-col justify-center transition-all shadow-sm z-10",
                  b.origem === "previsto" &&
                    "border-2 border-dashed border-[var(--color-purple)] bg-[var(--color-purple)]/15 text-[var(--text-primary)] font-semibold",
                  b.origem === "conflito" &&
                    "border-2 border-dashed border-[var(--color-terracotta)] bg-[var(--color-terracotta)]/20 text-[var(--text-primary)] font-bold",
                  b.origem === "concreto" &&
                    "border-2 border-[var(--border-brutal)] bg-[var(--color-gold)] text-[var(--text-primary)] font-bold shadow-[var(--ds-shadow)]",
                );
                if (b.recorrenteId) {
                  const ehConflito = b.origem === "conflito";
                  return (
                    <div
                      key={b.id}
                      aria-hidden="true"
                      data-testid="bloco-overlay"
                      onClick={() => aoAbrirRegra?.(b.recorrenteId!, b.rotulo)}
                      className={cn(classesBloco, "text-left leading-tight truncate cursor-pointer", FOCO)}
                      style={estilo}
                    >
                      <span className="truncate block">
                        {ehConflito
                          ? `⚠ ${b.rotulo} · não agendado`
                          : `${b.rotulo} · ${b.disciplina}`}
                      </span>
                    </div>
                  );
                }
                return (
                  <div
                    key={b.id}
                    aria-hidden="true"
                    data-testid="bloco-overlay"
                    onClick={() => aoAbrirRegra?.(b.id, b.rotulo)}
                    className={cn(classesBloco, "leading-tight truncate cursor-pointer", FOCO)}
                    style={estilo}
                  >
                    <span className="truncate block">
                      {b.rotulo} · {b.disciplina}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
