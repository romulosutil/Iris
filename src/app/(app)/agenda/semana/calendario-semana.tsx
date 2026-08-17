"use client";

import * as React from "react";
import {
  ScheduleGrid,
  type FaixaJanela,
  type BloqueioData,
} from "@/components/ui/schedule-grid";
import type { BlocoAgenda } from "@/lib/agenda/projecao";
import type { FaixaDia } from "@/lib/agenda/janela";

export interface CalendarioSemanaProps {
  dias: string[];
  passoMin: number;
  abertura: string;
  fechamento: string;
  janelas: FaixaDia[];
  bloqueios: BloqueioData[];
  blocos: BlocoAgenda[];
  aoAlocar: (diaSemana: number, inicioMin: number) => void;
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
  return (
    <ScheduleGrid
      dias={dias}
      passoMin={passoMin}
      abertura={abertura}
      fechamento={fechamento}
      janelas={janelas}
      bloqueios={bloqueios}
      blocos={blocos.map((b) => ({
        id: b.id,
        diaSemana: b.diaSemana,
        inicioMin: b.inicioMin,
        duracaoMin: b.duracaoMin,
        rotulo: b.rotulo,
        disciplina: b.disciplina,
        origem: b.origem,
        recorrenteId: b.recorrenteId,
      }))}
      aoAlocar={aoAlocar}
      aoAbrirRegra={aoAbrirRegra}
    />
  );
}
