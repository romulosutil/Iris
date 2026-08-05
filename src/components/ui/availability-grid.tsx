"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

import { chaveCelula, colunasDaGrade, copiarDia } from "@/lib/agenda/grade";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_ORDEM = [1, 2, 3, 4, 5, 6, 0]; // Segunda (1) a Domingo (0) para alinhar com a Agenda
const DIAS_UTEIS = [2, 3, 4, 5]; // segunda (1) é a origem; destinos: terça–sexta

export type AvailabilityGridProps = {
  passoMin?: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais?: Set<string>;
  celulas?: Set<string>;
  onCelulasChange?: (celulas: Set<string>) => void;
  onSalvar?: () => void;
  salvando?: boolean;
};

export function AvailabilityGrid({
  passoMin = 60,
  abertura = "07:00",
  fechamento = "20:00",
  celulasIniciais,
  celulas: celulasProps,
  onCelulasChange,
  onSalvar,
  salvando = false,
}: AvailabilityGridProps) {
  const cols = React.useMemo(
    () => colunasDaGrade(passoMin, abertura, fechamento),
    [passoMin, abertura, fechamento],
  );

  const [interno, setInterno] = React.useState<Set<string>>(
    () => celulasProps ?? celulasIniciais ?? new Set<string>(),
  );

  const celulasAtivas = celulasProps ?? interno;
  const [foco, setFoco] = React.useState<{ dia: number; col: number }>({ dia: 1, col: 0 });
  const pintandoRef = React.useRef<null | boolean>(null);
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());

  React.useEffect(() => {
    const soltar = () => {
      pintandoRef.current = null;
    };
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, []);

  function aplicar(next: Set<string>) {
    if (!celulasProps) setInterno(next);
    onCelulasChange?.(next);
  }

  function definir(dia: number, col: string, valor: boolean) {
    const chave = chaveCelula(dia, col);
    const next = new Set(celulasAtivas);
    if (valor) next.add(chave);
    else next.delete(chave);
    aplicar(next);
  }

  function alternar(dia: number, col: string) {
    definir(dia, col, !celulasAtivas.has(chaveCelula(dia, col)));
  }

  function focarCelula(diaIdx: number, colIdx: number): { d: number; c: number } {
    const dIdx = Math.max(0, Math.min(DIAS_ORDEM.length - 1, diaIdx));
    const d = DIAS_ORDEM[dIdx]!;
    const c = Math.max(0, Math.min(cols.length - 1, colIdx));
    setFoco({ dia: d, col: c });
    refs.current.get(chaveCelula(d, cols[c]!))?.focus();
    return { d, c };
  }

  function aoTeclar(e: React.KeyboardEvent, dia: number, colIdx: number) {
    const col = cols[colIdx]!;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alternar(dia, col);
      return;
    }
    const diaOrdemIdx = DIAS_ORDEM.indexOf(dia);
    const destinos: Record<string, [number, number]> = {
      ArrowUp: [diaOrdemIdx - 1, colIdx],
      ArrowDown: [diaOrdemIdx + 1, colIdx],
      ArrowLeft: [diaOrdemIdx, colIdx - 1],
      ArrowRight: [diaOrdemIdx, colIdx + 1],
    };
    const alvo = destinos[e.key];
    if (!alvo) return;
    e.preventDefault();
    const { d, c } = focarCelula(alvo[0], alvo[1]);
    if (e.shiftKey) definir(d, cols[c]!, true);
  }

  const totalHoras = ((celulasAtivas.size * passoMin) / 60).toFixed(1);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Barra de Ações Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variante="secundaria"
            tamanho="sm"
            onClick={() => aplicar(copiarDia(celulasAtivas, 1, DIAS_UTEIS, cols))}
          >
            Copiar Segunda ➔ Dias Úteis
          </Button>
          <Button
            type="button"
            variante="terciaria"
            tamanho="sm"
            onClick={() => aplicar(new Set<string>())}
          >
            Limpar grade
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] px-3 py-1 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)]">
            Total: <strong>{totalHoras}h</strong> semanais
          </span>
          {onSalvar ? (
            <Button
              type="button"
              variante="primaria"
              tamanho="sm"
              isLoading={salvando}
              onClick={onSalvar}
            >
              Salvar disponibilidade
            </Button>
          ) : null}
        </div>
      </div>

      {/* Grade de Matriz de Disponibilidade */}
      <div
        role="grid"
        aria-label="Grade de disponibilidade semanal"
        className="w-full overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)] p-3"
      >
        {/* Cabeçalho de Horários */}
        <div role="row" className="flex items-center border-b border-[var(--border-brutal)]/30 pb-1.5 mb-1.5">
          <div role="columnheader" className="w-24 shrink-0 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] px-2">
            Dia / Hora
          </div>
          <div className="flex items-center">
            {cols.map((c) => (
              <div
                key={c}
                role="columnheader"
                className="w-20 shrink-0 text-center font-mono text-xs font-bold text-[var(--text-secondary)] border-l border-[var(--border-brutal)]/20 py-1"
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        {/* Linhas de Dias da Semana */}
        <div className="flex flex-col gap-1">
          {DIAS_ORDEM.map((dia) => {
            const nome = DIAS[dia]!;
            return (
              <div role="row" key={dia} className="flex items-stretch border-t border-[var(--border-brutal)]/20 first:border-t-0 py-0.5">
                <div
                  role="rowheader"
                  className="w-24 shrink-0 font-display text-sm font-extrabold text-[var(--text-primary)] flex items-center px-2"
                >
                  {nome}
                </div>
                <div className="flex items-stretch">
                  {cols.map((col, colIdx) => {
                    const selecionada = celulasAtivas.has(chaveCelula(dia, col));
                    const ehFoco = foco.dia === dia && foco.col === colIdx;
                    return (
                      <button
                        type="button"
                        key={col}
                        role="gridcell"
                        ref={(el) => {
                          refs.current.set(chaveCelula(dia, col), el);
                        }}
                        tabIndex={ehFoco ? 0 : -1}
                        aria-selected={selecionada}
                        aria-label={`${nome} ${col}: ${selecionada ? "disponível" : "indisponível"}`}
                        onFocus={() => setFoco({ dia, col: colIdx })}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          const novo = !selecionada;
                          pintandoRef.current = novo;
                          definir(dia, col, novo);
                        }}
                        onPointerEnter={() => {
                          if (pintandoRef.current !== null) definir(dia, col, pintandoRef.current);
                        }}
                        onKeyDown={(e) => aoTeclar(e, dia, colIdx)}
                        className={cn(
                          "w-20 h-11 shrink-0 border-l border-[var(--border-brutal)]/20 transition-all duration-75 flex items-center justify-center font-mono text-xs font-extrabold rounded-lg mx-[1px]",
                          "focus-visible:outline-focus outline-none z-10",
                          selecionada
                            ? "bg-emerald-500 text-white border border-emerald-600 shadow-xs"
                            : "bg-[var(--surface-card)] hover:bg-emerald-500/20 text-transparent hover:text-emerald-700",
                        )}
                      >
                        {selecionada ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
