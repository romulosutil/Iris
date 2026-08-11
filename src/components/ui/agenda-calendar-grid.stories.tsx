import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AgendaCalendarGrid } from "./agenda-calendar-grid";

const mockTerapeutas = [
  { id: "t1", nome: "Dra. Beatriz Santos", disciplina: "Fonoaudiologia" },
  { id: "t2", nome: "Dr. Carlos Eduardo", disciplina: "Terapia Ocupacional" },
  { id: "t3", nome: "Dra. Fernanda Lima", disciplina: "Psicologia ABA" },
];

const mockSessoes = [
  {
    id: "s1",
    terapeutaId: "t1",
    pacienteNome: "Arthur Silveira",
    disciplina: "Fonoaudiologia",
    agendadaPara: new Date(2026, 7, 12, 8, 0),
    duracaoMin: 50,
    statusSemantico: "concluida" as const,
  },
  {
    id: "s2",
    terapeutaId: "t2",
    pacienteNome: "Lucas Mendes",
    disciplina: "Terapia Ocupacional",
    agendadaPara: new Date(2026, 7, 12, 9, 0),
    duracaoMin: 50,
    statusSemantico: "em_andamento" as const,
  },
  {
    id: "s3",
    terapeutaId: "t3",
    pacienteNome: "Mariana Costa",
    disciplina: "Psicologia ABA",
    agendadaPara: new Date(2026, 7, 12, 9, 0),
    duracaoMin: 50,
    statusSemantico: "agendada" as const,
  },
  {
    id: "s4",
    terapeutaId: "t1",
    pacienteNome: "Guilherme Santos",
    disciplina: "Fonoaudiologia",
    agendadaPara: new Date(2026, 7, 12, 10, 0),
    duracaoMin: 25, // Slot curto <30min
    statusSemantico: "agendada" as const,
  },
  {
    id: "s5",
    terapeutaId: "t2",
    pacienteNome: "Gabriel Oliveira (Encaixe Sugerido)",
    disciplina: "Terapia Ocupacional",
    agendadaPara: new Date(2026, 7, 12, 11, 0),
    duracaoMin: 50,
    statusSemantico: "sugerida_ia" as const,
    isAISuggestion: true,
  },
];

const meta = {
  title: "Organisms/AgendaCalendarGrid",
  component: AgendaCalendarGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AgendaCalendarGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultDayView: Story = {
  args: {
    view: "day",
    terapeutas: mockTerapeutas.slice(0, 1),
    sessoes: mockSessoes.filter((s) => s.terapeutaId === "t1"),
    abertura: "08:00",
    fechamento: "14:00",
    passoMin: 60,
    dataReferencia: new Date(2026, 7, 12),
    onSlotClick: (tId, h) => alert(`Slot clicado: Terapeuta ${tId} às ${h}`),
    onSessaoClick: (s) => alert(`Sessão clicada: ${s.pacienteNome}`),
  },
};

export const WeekViewCoordinator: Story = {
  args: {
    view: "week",
    terapeutas: mockTerapeutas,
    sessoes: mockSessoes,
    abertura: "08:00",
    fechamento: "14:00",
    passoMin: 60,
    dataReferencia: new Date(2026, 7, 12),
    onSlotClick: (tId, h) => alert(`Novo agendamento: Terapeuta ${tId} às ${h}`),
    onSessaoClick: (s) => alert(`Detalhes da sessão: ${s.pacienteNome}`),
  },
};

export const WithAISuggestedSlots: Story = {
  args: {
    view: "week",
    terapeutas: mockTerapeutas,
    sessoes: [
      ...mockSessoes,
      {
        id: "s-ia-1",
        terapeutaId: "t3",
        pacienteNome: "Enzo Ribeiro (Reposição IA)",
        disciplina: "Psicologia ABA",
        agendadaPara: new Date(2026, 7, 12, 13, 0),
        duracaoMin: 50,
        statusSemantico: "sugerida_ia",
        isAISuggestion: true,
      },
    ],
    abertura: "08:00",
    fechamento: "15:00",
    passoMin: 60,
    dataReferencia: new Date(2026, 7, 12),
  },
};

export const EmptyStateAgenda: Story = {
  args: {
    view: "day",
    terapeutas: [],
    sessoes: [],
  },
};
