"use client";

import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";

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

function minParaHora(m: number): string {
  const hh = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ScheduleGrid({
  dias,
  passoMin = 60,
  abertura = "07:00",
  fechamento = "20:00",
  blocos = [],
  aoAlocar,
  aoAbrirRegra,
}: ScheduleGridProps) {
  // Converte BlocoAgendaItem para formato SessaoDoDia compativel com o Calendar.Grid
  const sessoesFormatadas: SessaoDoDia[] = React.useMemo(() => {
    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth();
    const diaHoje = new Date().getDate();

    return blocos.map((b) => {
      const horaStr = minParaHora(b.inicioMin);
      const [hh, mm] = horaStr.split(":").map(Number);
      const dt = new Date(anoAtual, mesAtual, diaHoje + b.diaSemana, hh, mm);

      return {
        id: b.id,
        patientId: "demo-paciente",
        pacienteNome: b.rotulo,
        terapeutaId: "demo-terapeuta",
        terapeutaNome: "Profissional",
        disciplina: b.disciplina,
        agendadaPara: dt,
        estado: b.origem === "conflito" ? "falta_paciente" : "agendada",
      };
    });
  }, [blocos]);

  const diasFormatados = React.useMemo(() => {
    return dias.map((rotulo, idx) => ({
      dataISO: "",
      rotulo,
      diaSemana: (idx + 1) % 7,
    }));
  }, [dias]);

  return (
    <Calendar.Grid
      modo="weekly-timeline"
      sessoes={sessoesFormatadas}
      diasSemana={diasFormatados}
      abertura={abertura}
      fechamento={fechamento}
      passoMin={passoMin}
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
