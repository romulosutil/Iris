"use client";
import { useEffect, useRef, useState } from "react";
import { chaveCelula, colunasDaGrade, copiarDia } from "@/lib/agenda/grade";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_UTEIS = [2, 3, 4, 5]; // segunda (1) é a origem; destinos: terça–sexta
const FOCO =
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";

export type GradeProps = {
  passoMin: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais: Set<string>;
  onChange: (celulas: Set<string>) => void;
};

export function GradeDisponibilidade({
  passoMin,
  abertura = "07:00",
  fechamento = "20:00",
  celulasIniciais,
  onChange,
}: GradeProps) {
  const cols = colunasDaGrade(passoMin, abertura, fechamento);
  const [celulas, setCelulas] = useState<Set<string>>(new Set(celulasIniciais));
  const [foco, setFoco] = useState<{ dia: number; col: number }>({ dia: 0, col: 0 });
  const pintandoRef = useRef<null | boolean>(null); // valor sendo pintado no drag
  const refs = useRef(new Map<string, HTMLButtonElement | null>());

  // Garante reset do drag mesmo que o ponteiro seja solto fora da grade.
  useEffect(() => {
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
    setCelulas(next);
    onChange(next);
  }
  function definir(dia: number, col: string, valor: boolean) {
    const chave = chaveCelula(dia, col);
    const next = new Set(celulas);
    if (valor) next.add(chave);
    else next.delete(chave);
    aplicar(next);
  }
  function alternar(dia: number, col: string) {
    definir(dia, col, !celulas.has(chaveCelula(dia, col)));
  }
  function focarCelula(dia: number, colIdx: number): { d: number; c: number } {
    const d = Math.max(0, Math.min(DIAS.length - 1, dia));
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
    const destinos: Record<string, [number, number]> = {
      ArrowUp: [dia - 1, colIdx],
      ArrowDown: [dia + 1, colIdx],
      ArrowLeft: [dia, colIdx - 1],
      ArrowRight: [dia, colIdx + 1],
    };
    const alvo = destinos[e.key];
    if (!alvo) return;
    e.preventDefault();
    const { d, c } = focarCelula(alvo[0], alvo[1]);
    if (e.shiftKey) definir(d, cols[c]!, true); // Shift+seta pinta o destino
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => aplicar(copiarDia(celulas, 1, DIAS_UTEIS, cols))}
          className={`font-display border-[var(--border-brutal)] border-2 bg-[var(--surface-card)] text-[var(--text-primary)] px-3 py-2 text-sm font-bold rounded-[var(--radius-xs)] ${FOCO}`}
        >
          Copiar segunda para os dias úteis
        </button>
      </div>
      <div role="grid" aria-label="Grade de disponibilidade semanal" className="overflow-x-auto">
        <div role="row" className="flex">
          <div role="columnheader" className="w-24 shrink-0" />
          {cols.map((c) => (
            <div key={c} role="columnheader" className="font-body text-[var(--text-secondary)] w-12 shrink-0 text-center text-xs">
              {c}
            </div>
          ))}
        </div>
        {DIAS.map((nome, dia) => (
          <div role="row" key={dia} className="flex items-stretch">
            <div role="rowheader" className="font-display text-[var(--text-primary)] flex w-24 shrink-0 items-center text-sm font-bold">
              {nome}
            </div>
            {cols.map((col, colIdx) => {
              const selecionada = celulas.has(chaveCelula(dia, col));
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
                  className={`m-px h-9 w-12 shrink-0 border ${FOCO} ${
                    selecionada ? "bg-[var(--color-gold)] border-[var(--border-brutal)]" : "bg-[var(--bg-app)] border-[var(--border-brutal)]/40"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
