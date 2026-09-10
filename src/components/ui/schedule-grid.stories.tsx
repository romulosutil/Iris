import * as React from "react";
import type { Meta } from "@storybook/nextjs-vite";
import { ScheduleGrid, type BlocoAgendaItem } from "./schedule-grid";
import { CalendarGrid } from "./calendar/calendar-grid";

const meta = {
  title: "05. PATTERNS/Clinical & Schedules/ScheduleGrid",
  component: ScheduleGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScheduleGrid>;

export default meta;

const mockDias = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
];

const mockBlocos: BlocoAgendaItem[] = [
  {
    id: "1",
    diaSemana: 1, // Segunda
    inicioMin: 540, // 09:00
    duracaoMin: 60,
    rotulo: "Arthur Silva",
    disciplina: "FONO",
    origem: "concreto",
  },
  {
    id: "2",
    diaSemana: 2, // Terça
    inicioMin: 600, // 10:00
    duracaoMin: 90,
    rotulo: "Beatriz Santos",
    disciplina: "TO",
    origem: "previsto",
    recorrenteId: "regra-101",
  },
  {
    id: "3",
    diaSemana: 3, // Quarta
    inicioMin: 840, // 14:00
    duracaoMin: 60,
    rotulo: "Conflito de Horário",
    disciplina: "ABA",
    origem: "conflito",
    recorrenteId: "regra-102",
  },
];

export const Padrao = {
  render: () => (
    <div className="mx-auto max-w-6xl space-y-4 bg-[var(--bg-app)] p-4">
      <ScheduleGrid
        dias={mockDias}
        blocos={mockBlocos}
        fuso="America/Sao_Paulo"
        aoAlocar={(dia, inicio) =>
          alert(`Alocar slot no dia ${dia} às ${inicio}min`)
        }
        aoAbrirRegra={(id, rotulo) => alert(`Regra: ${id} (${rotulo})`)}
      />
    </div>
  ),
};

/**
 * Com janelas de trabalho (seg–sex 08–12 / 13–18) e "hoje" = quarta: célula
 * fora da janela fica hachurada e a linha de hoje ganha destaque. É o estado
 * real de `/agenda?escala=semana` depois que o terapeuta pintou a
 * disponibilidade em `/equipe/[id]`.
 */
export const ComJanelasEHoje = {
  render: () => (
    <div className="mx-auto max-w-6xl space-y-4 bg-[var(--bg-app)] p-4">
      <ScheduleGrid
        dias={mockDias}
        blocos={mockBlocos}
        fuso="America/Sao_Paulo"
        hojeISO="2026-07-22"
        janelas={[1, 2, 3, 4, 5].flatMap((diaSemana) => [
          { diaSemana, horaInicio: "08:00", horaFim: "12:00" },
          { diaSemana, horaInicio: "13:00", horaFim: "18:00" },
        ])}
        aoAlocar={(dia, inicio) =>
          alert(`Alocar slot no dia ${dia} às ${inicio}min`)
        }
      />
    </div>
  ),
};

/** Matriz de disponibilidade: clique marca; segurar e arrastar pinta a faixa. */
export const MatrizDisponibilidade = {
  render: function MatrizStory() {
    const [celulas, setCelulas] = React.useState<Set<string>>(
      () => new Set(["1-09:00", "1-09:30", "1-10:00"]),
    );
    return (
      <div className="mx-auto max-w-6xl space-y-2 bg-[var(--bg-app)] p-4">
        <p className="font-mono text-xs">Células ativas: {celulas.size}</p>
        <CalendarGrid
          modo="availability-matrix"
          abertura="07:00"
          fechamento="20:00"
          passoMin={30}
          celulasSelecionadas={celulas}
          onCelulasChange={setCelulas}
          fuso="America/Sao_Paulo"
        />
      </div>
    );
  },
};

export const Mobile = {
  globals: { viewport: { value: "terapeuta" } },
  render: () => (
    <div className="bg-[var(--bg-app)] p-2">
      <ScheduleGrid
        dias={mockDias}
        blocos={mockBlocos}
        fuso="America/Sao_Paulo"
      />
    </div>
  ),
};
