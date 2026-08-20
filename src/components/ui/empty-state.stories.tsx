import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EmptyState } from "./empty-state";
import { Button } from "./button";
import {
  CareTeamIllustration,
  CareCalendarIllustration,
  ReviewClinicalIllustration,
  PatientProgressIllustration,
  AudioMicIllustration,
} from "./illustrations";
import { MicroConquistaBadge } from "./micro-conquista-badge";

const meta = {
  title: "05. PATTERNS/System States & Badges/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TeamCareEmpty: Story = {
  args: {
    illustration: <CareTeamIllustration size={120} />,
    title: "Sua equipe de cuidado está pronta para ser montada",
    description:
      "Prescreva a carga horária e adicione as disciplinas para conectar os terapeutas a este paciente.",
    action: <Button variante="primaria">Prescrever Carga Horária</Button>,
    secondaryAction: (
      <Button variante="secundaria">Convidar Profissional</Button>
    ),
  },
};

export const CalendarDayEmpty: Story = {
  args: {
    illustration: <CareCalendarIllustration size={120} />,
    title: "Sua rotina do dia está concluída",
    description:
      "Nenhum atendimento pendente para hoje. Fim de expediente de verdade!",
    badge: (
      <MicroConquistaBadge icon="check">Dia Concluído</MicroConquistaBadge>
    ),
    variant: "celebration",
  },
};

export const ReviewValidationEmpty: Story = {
  args: {
    illustration: <ReviewClinicalIllustration size={120} />,
    title: "Tudo em dia na Fila de Validação!",
    description:
      "Todas as anotações geradas pelas sessões foram validadas pelo seu olhar clínico.",
    action: <Button variante="secundaria">Ir para a Agenda</Button>,
    secondaryAction: <Button variante="terciaria">Ver Supervisão</Button>,
    variant: "celebration",
  },
};

export const PatientProgressEmpty: Story = {
  args: {
    illustration: <PatientProgressIllustration size={120} />,
    title: "Cada pequena conquista conta",
    description:
      "Registre a primeira sessão clínica para começar a acompanhar o crescimento e evolução do paciente no PEI.",
    action: <Button variante="primaria">Iniciar Novo Diário de Sessão</Button>,
  },
};

export const AudioMicRecordingReady: Story = {
  args: {
    illustration: <AudioMicIllustration size={120} />,
    title: "A tecnologia anota. Quem transforma é você",
    description:
      "Toque no microfone para ditar a sua evolução clínica da sessão com tranquilidade.",
    action: <Button variante="primaria">Gravar Áudio da Sessão</Button>,
  },
};
