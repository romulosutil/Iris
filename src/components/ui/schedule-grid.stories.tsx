import type { Meta } from "@storybook/nextjs-vite";
import { ScheduleGrid, type BlocoAgendaItem } from "./schedule-grid";

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
        aoAlocar={(dia, inicio) =>
          alert(`Alocar slot no dia ${dia} às ${inicio}min`)
        }
        aoAbrirRegra={(id, rotulo) => alert(`Regra: ${id} (${rotulo})`)}
      />
    </div>
  ),
};

export const Mobile = {
  globals: { viewport: { value: "terapeuta" } },
  render: () => (
    <div className="bg-[var(--bg-app)] p-2">
      <ScheduleGrid dias={mockDias} blocos={mockBlocos} />
    </div>
  ),
};
