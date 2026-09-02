"use client";

import * as React from "react";
import {
  CalendarGrid,
  type CalendarEvento,
} from "@/components/ui/calendar/calendar-grid";
import { resolverInstante } from "@/lib/agenda/materializar";

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
  fuso: string;
}

function minParaHora(m: number): string {
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ScheduleGrid({
  dias,
  passoMin = 60,
  abertura = "07:00",
  fechamento = "20:00",
  blocos = [],
  bloqueios = [],
  aoAlocar,
  aoAbrirRegra,
  fuso,
}: ScheduleGridProps) {
  // Converte BlocoAgendaItem para o `CalendarEvento` que a CalendarGrid posiciona
  const sessoesFormatadas: CalendarEvento[] = React.useMemo(() => {
    const hoje = new Date();
    const hojeSemana = hoje.getDay(); // 0-6 (dom-seg)
    const inicioSemanaDia = hoje.getDate() - hojeSemana;

    return blocos.map((b) => {
      const horaStr = minParaHora(b.inicioMin);
      // O dia da semana é escolhido em cima do relógio local (só precisa achar
      // "esta semana"), mas a hora é ancorada no fuso da clínica — não no fuso
      // da máquina que roda o código — senão obterHorarioSlot() (que sempre lê
      // em `fuso`) devolve um horário diferente do que foi passado aqui, e a
      // sessão cai fora da célula/janela visível da grade.
      const diaDate = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        inicioSemanaDia + b.diaSemana,
      );
      const dataISO = `${diaDate.getFullYear()}-${String(diaDate.getMonth() + 1).padStart(2, "0")}-${String(diaDate.getDate()).padStart(2, "0")}`;
      const dt = resolverInstante(dataISO, horaStr, fuso);

      return {
        id: b.id,
        pacienteNome: b.rotulo,
        terapeutaId: "demo-terapeuta",
        terapeutaNome: "Profissional",
        disciplina: b.disciplina,
        agendadaPara: dt,
        estado: b.origem === "conflito" ? "falta_paciente" : "agendada",
      };
    });
  }, [blocos, fuso]);

  const diasFormatados = React.useMemo(() => {
    return dias.map((d, idx) => ({
      dataISO: d,
      rotulo: d,
      diaSemana: (idx + 1) % 7,
    }));
  }, [dias]);

  return (
    <CalendarGrid
      modo="weekly-timeline"
      abertura={abertura}
      fechamento={fechamento}
      passoMin={passoMin}
      diasSemana={diasFormatados}
      sessoes={sessoesFormatadas}
      bloqueios={bloqueios}
      fuso={fuso}
      onSlotClick={(_, horarioStr, diaSemana) => {
        const [hh, mm] = horarioStr.split(":").map(Number);
        const inicioMin = (hh ?? 0) * 60 + (mm ?? 0);
        aoAlocar?.(diaSemana ?? 1, inicioMin);
      }}
      onEventClick={(sessao) => {
        const bloco = blocos.find((b) => b.id === sessao.id);
        if (bloco?.recorrenteId) {
          aoAbrirRegra?.(bloco.recorrenteId, bloco.rotulo);
        }
      }}
    />
  );
}
