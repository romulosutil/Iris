"use client";

import * as React from "react";
import { PopoverAlocar } from "@/app/(app)/agenda/semana/popover-alocar";
import type { Opcao } from "@/app/(app)/agenda/semana/combobox-entidade";

export interface CalendarSlotDialogProps {
  aberto: boolean;
  aoFechar: () => void;
  diaSemana: number;
  inicioMin: number;
  dataISO?: string;
  semanaVisivelISO?: string;
  hojeISO?: string;
  terapeutaId?: string;
  pacienteId?: string;
  terapeutas?: Opcao[];
  pacientes?: Opcao[];
  disciplinas?: string[];
}

export function CalendarSlotDialog({
  aberto,
  aoFechar,
  diaSemana,
  inicioMin,
  dataISO = new Date().toISOString().split("T")[0]!,
  semanaVisivelISO = new Date().toISOString().split("T")[0]!,
  hojeISO = new Date().toISOString().split("T")[0]!,
  terapeutaId,
  pacienteId,
  terapeutas = [],
  pacientes = [],
  disciplinas = ["ABA", "Fonoaudiologia", "Psicologia", "Terapia Ocupacional"],
}: CalendarSlotDialogProps) {
  const entidadeFixa = React.useMemo(() => {
    if (terapeutaId) {
      const found = terapeutas.find((t) => t.id === terapeutaId);
      return { id: terapeutaId, nome: found?.nome ?? "Profissional" };
    }
    if (pacienteId) {
      const found = pacientes.find((p) => p.id === pacienteId);
      return { id: pacienteId, nome: found?.nome ?? "Paciente" };
    }
    return { id: terapeutas[0]?.id ?? "padrao", nome: terapeutas[0]?.nome ?? "Profissional" };
  }, [terapeutaId, pacienteId, terapeutas, pacientes]);

  return (
    <PopoverAlocar
      aberto={aberto}
      aoFechar={aoFechar}
      diaSemana={diaSemana}
      inicioMin={inicioMin}
      dataISO={dataISO}
      semanaVisivelISO={semanaVisivelISO}
      hojeISO={hojeISO}
      eixo={pacienteId ? "paciente" : "terapeuta"}
      entidadeFixa={entidadeFixa}
      terapeutas={terapeutas}
      pacientes={pacientes}
      disciplinas={disciplinas}
      duracaoPadrao={{ default: 60 }}
    />
  );
}
