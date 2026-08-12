import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AgendaCalendarGrid, AppointmentEvent } from "@/components/ui/agenda-calendar-grid";

const mockEvents: AppointmentEvent[] = [
  // Segunda-feira (2026-07-13)
  {
    id: "1",
    pacienteNome: "Vitor Hugo",
    disciplina: "Fonoaudiologia",
    inicio: "08:00",
    fim: "09:00",
    data: "2026-07-13",
    estado: "concluido",
  },
  {
    id: "2",
    pacienteNome: "Ana Júlia",
    disciplina: "Terapia Ocupacional",
    inicio: "09:00",
    fim: "09:45",
    data: "2026-07-13",
    estado: "em-andamento",
  },
  {
    id: "3",
    pacienteNome: "Lucas Gabriel",
    disciplina: "Psicologia ABA",
    inicio: "09:15",
    fim: "10:15",
    data: "2026-07-13", // Colisão intencional com Ana Júlia para testar sobreposição!
    estado: "sugerido",
  },
  // Terça-feira (2026-07-14)
  {
    id: "4",
    pacienteNome: "Alice Santos",
    disciplina: "Fisioterapia Motora",
    inicio: "11:00",
    fim: "12:00",
    data: "2026-07-14",
    estado: "concluido",
  },
  // Quarta-feira (2026-07-15)
  {
    id: "5",
    pacienteNome: "Mateus Lima",
    disciplina: "Psicomotricidade",
    inicio: "14:00",
    fim: "14:20", // Slot curto < 30min para testar layout compacto flex-row!
    data: "2026-07-15",
    estado: "em-andamento",
  },
  {
    id: "6",
    pacienteNome: "Enzo Ribeiro",
    disciplina: "Psicologia ABA",
    inicio: "14:30",
    fim: "15:30",
    data: "2026-07-15",
    estado: "sugerido",
  },
];

const meta = {
  title: "ORGANISMS/AgendaCalendarGrid",
  component: AgendaCalendarGrid,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    events: mockEvents,
    selectedDate: new Date("2026-07-13"),
    view: "week",
    onEventClick: fn(),
  },
  argTypes: {
    view: {
      control: "inline-radio",
      options: ["day", "week"],
    },
  },
} satisfies Meta<typeof AgendaCalendarGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story WeekViewCoordinator (visão semanal em grade cheia desktop com múltiplas disciplinas)
export const WeekViewCoordinator: Story = {};

// Story DefaultDayView (grade do dia para terapeuta em mobile)
export const DefaultDayView: Story = {
  args: {
    view: "day",
    selectedDate: new Date("2026-07-13"),
  },
};

// Story WithAISuggestedSlots (grade com encaixes pendentes + borda tracejada violeta + badge "Sugestão IA" ou correspondente)
export const WithAISuggestedSlots: Story = {
  args: {
    view: "week",
    events: [
      {
        id: "s1",
        pacienteNome: "Sugerido por IA 1",
        disciplina: "Fonoaudiologia",
        inicio: "10:00",
        fim: "11:00",
        data: "2026-07-13",
        estado: "sugerido",
      },
      {
        id: "s2",
        pacienteNome: "Encaixe Pendente",
        disciplina: "Terapia Ocupacional",
        inicio: "15:30",
        fim: "16:15",
        data: "2026-07-14",
        estado: "sugerido",
      },
    ],
  },
};

// Story EmptyStateAgenda (estado vazio sem atendimentos agendados)
export const EmptyStateAgenda: Story = {
  args: {
    events: [],
    view: "week",
  },
};
