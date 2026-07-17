"use client";
import { useState } from "react";
import { chaveCelula, colunasDaGrade, copiarDia } from "@/lib/agenda/grade";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_UTEIS = [2, 3, 4, 5]; // destino do "copiar segunda"
const FOCO = "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";

export type GradeProps = {
  passoMin: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais: Set<string>;
  onChange: (celulas: Set<string>) => void;
};

export function GradeDisponibilidade({ passoMin, abertura = "07:00", fechamento = "20:00", celulasIniciais, onChange }: GradeProps) {
  const cols = colunasDaGrade(passoMin, abertura, fechamento);
  const [celulas, setCelulas] = useState<Set<string>>(new Set(celulasIniciais));
  const [pintando, setPintando] = useState<null | boolean>(null); // drag: valor a aplicar

  function aplicar(next: Set<string>) {
    setCelulas(next);
    onChange(next);
  }
  function alternar(dia: number, col: string) {
    const chave = chaveCelula(dia, col);
    const next = new Set(celulas);
    next.has(chave) ? next.delete(chave) : next.add(chave);
    aplicar(next);
  }
  function definir(dia: number, col: string, valor: boolean) {
    const chave = chaveCelula(dia, col);
    const next = new Set(celulas);
    valor ? next.add(chave) : next.delete(chave);
    aplicar(next);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => aplicar(copiarDia(celulas, 1, DIAS_UTEIS, cols))}
          className={`font-display border-ink-anchor border-2 bg-surface px-3 py-2 text-sm font-bold ${FOCO}`}
        >
          Copiar segunda para os dias úteis
        </button>
      </div>
      <div role="grid" aria-label="Grade de disponibilidade semanal" className="overflow-x-auto">
        <div role="row" className="flex">
          <div role="columnheader" className="w-24 shrink-0" />
          {cols.map((c) => (
            <div key={c} role="columnheader" className="font-body text-ink w-12 shrink-0 text-center text-xs">
              {c}
            </div>
          ))}
        </div>
        {DIAS.map((nome, dia) => (
          <div role="row" key={dia} className="flex items-stretch">
            <div role="rowheader" className="font-display text-ink-anchor flex w-24 shrink-0 items-center text-sm font-bold">
              {nome}
            </div>
            {cols.map((col) => {
              const selecionada = celulas.has(chaveCelula(dia, col));
              return (
                <button
                  type="button"
                  key={col}
                  role="gridcell"
                  aria-selected={selecionada}
                  aria-label={`${nome} ${col}: ${selecionada ? "disponível" : "indisponível"}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const novo = !selecionada;
                    setPintando(novo);
                    definir(dia, col, novo);
                  }}
                  onPointerEnter={() => {
                    if (pintando !== null) definir(dia, col, pintando);
                  }}
                  onPointerUp={() => setPintando(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      alternar(dia, col);
                    }
                  }}
                  className={`m-px h-9 w-12 shrink-0 border ${FOCO} ${
                    selecionada ? "bg-gold border-ink-anchor" : "bg-canvas border-ink/20"
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
