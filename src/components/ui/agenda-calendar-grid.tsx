"use client";

import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";

export interface AgendaCalendarGridProps {
  sessoes: SessaoDoDia[];
  terapeutas: { id: string; nome: string }[];
  role: string;
  userId: string;
  podeGerir: boolean;
  abertura?: string;
  fechamento?: string;
  passoMin?: number;
  onSlotClick?: (terapeutaId: string, horario: string) => void;
}

export function AgendaCalendarGrid({
  sessoes,
  terapeutas,
  podeGerir,
  abertura = "07:00",
  fechamento = "20:00",
  passoMin = 60,
  onSlotClick,
}: AgendaCalendarGridProps) {
  const [sessaoSelecionada, setSessaoSelecionada] = React.useState<SessaoDoDia | null>(null);

  const opcoesTerapeutas = React.useMemo(() => {
    return terapeutas.map((t) => ({ id: t.id, nome: t.nome }));
  }, [terapeutas]);

  return (
    <Calendar fuso="America/Sao_Paulo" podeGerir={podeGerir}>
      <Calendar.Grid
        modo="daily-resources"
        sessoes={sessoes}
        recursos={opcoesTerapeutas}
        abertura={abertura}
        fechamento={fechamento}
        passoMin={passoMin}
        podeGerir={podeGerir}
        onSlotClick={(recursoId, horarioStr) => onSlotClick?.(recursoId, horarioStr)}
        onEventClick={(sessao) => setSessaoSelecionada(sessao)}
      />

      <Calendar.Sidebar
        sessao={sessaoSelecionada}
        aberto={sessaoSelecionada !== null}
        aoFechar={() => setSessaoSelecionada(null)}
        terapeutas={opcoesTerapeutas}
        podeGerir={podeGerir}
      />
    </Calendar>
  );
}
