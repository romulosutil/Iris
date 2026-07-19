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
      className="border-border-brutal overflow-x-auto border-2"
    >
      <div role="row" className="flex">
        <div className="shrink-0" style={{ width: `${LARGURA_ROTULO_REM}rem` }} />
        {colunas.map((c) => (
          <div
            key={c}
            role="columnheader"
            className="font-body text-ink w-12 shrink-0 border-l border-border-brutal/20 text-center text-xs"
          >
            {c}
          </div>
        ))}
      </div>
      {dias.map((diaISO, linha) => {
        const diaSemana = new Date(`${diaISO}T00:00:00Z`).getUTCDay();
        const bloqueado = estaBloqueado(diaISO);
        return (
          <div role="row" key={diaISO} className="relative flex items-stretch">
            <div
              role="rowheader"
              className="font-display text-ink-anchor flex shrink-0 items-center text-sm font-bold"
              style={{ width: `${LARGURA_ROTULO_REM}rem` }}
            >
              {DIAS_LABEL[diaSemana]}
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
                    "border-border-brutal/20 h-10 w-12 shrink-0 border-l",
                    FOCO,
                    bloqueado
                      ? "bg-status-error-bg/30 cursor-not-allowed"
                      : "bg-surface cursor-pointer",
                    foraJanela && !bloqueado && "bg-gold/10",
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
                  "absolute top-0 h-10 overflow-hidden px-1 text-xs",
                  b.origem === "previsto" &&
                    "border-status-ia-border bg-status-ia-bg border-2 border-dashed",
                  b.origem === "conflito" &&
                    "border-status-error-border bg-status-error-bg border-2 border-dashed",
                  b.origem === "concreto" &&
                    "border-border-brutal bg-status-success-bg border-2",
                );
                // Bloco de origem recorrente (regra ou sessão materializada
                // dela) vira acionável — abre o popover de detalhe/ações da
                // regra (F2/F4/F5). Avulsa pura (sem recorrenteId) continua
                // decorativa p/ leitor de tela (a info já é anunciada na
                // célula onde o bloco começa, ver rotuloCelula acima).
                if (b.recorrenteId) {
                  const ehConflito = b.origem === "conflito";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-testid="bloco-overlay"
                      aria-label={
                        ehConflito
                          ? `Conflito: ${b.rotulo} não agendado em ${b.disciplina}. Abrir detalhes da regra.`
                          : undefined
                      }
                      onClick={() => aoAbrirRegra?.(b.recorrenteId!, b.rotulo)}
                      className={cn(classesBloco, "text-left", FOCO)}
                      style={estilo}
                    >
                      {ehConflito
                        ? `⚠ ${b.rotulo} · não agendado`
                        : `${b.rotulo} · ${b.disciplina}`}
                    </button>
                  );
                }
                return (
                  <div
                    key={b.id}
                    aria-hidden="true"
                    data-testid="bloco-overlay"
                    className={classesBloco}
                    style={estilo}
                  >
                    {b.rotulo} · {b.disciplina}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
