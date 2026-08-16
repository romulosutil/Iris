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
  bloqueios = [],
  aoAlocar,
  aoAbrirRegra,
}: ScheduleGridProps) {
  // Converte BlocoAgendaItem para formato SessaoDoDia compativel com o Calendar.Grid
  const sessoesFormatadas: SessaoDoDia[] = React.useMemo(() => {
    const hoje = new Date();
    const hojeSemana = hoje.getDay(); // 0-6 (dom-seg)
    const inicioSemanaDia = hoje.getDate() - hojeSemana;

    return blocos.map((b) => {
      const horaStr = minParaHora(b.inicioMin);
      const [hh, mm] = horaStr.split(":").map(Number);
      const dt = new Date(hoje.getFullYear(), hoje.getMonth(), inicioSemanaDia + b.diaSemana, hh, mm);

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
    return dias.map((d, idx) => ({
      dataISO: d,
      rotulo: d,
      diaSemana: (idx + 1) % 7,
    }));
  }, [dias]);

  return (
    <Calendar.Grid
      modo="weekly-timeline"
      abertura={abertura}
      fechamento={fechamento}
      passoMin={passoMin}
      diasSemana={diasFormatados}
      sessoes={sessoesFormatadas}
      bloqueios={bloqueios}
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
