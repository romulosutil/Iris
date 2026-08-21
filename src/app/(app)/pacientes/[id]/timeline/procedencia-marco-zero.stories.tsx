import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProcedenciaMarcoZero } from "./procedencia-marco-zero";

const meta: Meta<typeof ProcedenciaMarcoZero> = {
  title: "05. PATTERNS/Clinical & Schedules/ProcedenciaMarcoZero",
  component: ProcedenciaMarcoZero,
  parameters: {
    layout: "centered",
  },
};
export default meta;

type Story = StoryObj<typeof ProcedenciaMarcoZero>;

/** Nível de partida relatado pelo responsável na entrevista de admissão */
export const RelatadoResponsavel: Story = {
  args: {
    origem: "anamnese",
    procedencia: "relatado_responsavel",
  },
};

/** Nível de partida observado diretamente pelo avaliador/terapeuta */
export const ObservadoAvaliador: Story = {
  args: {
    origem: "anamnese",
    procedencia: "observado_avaliador",
  },
};

/** Nível de partida importado de laudo ou registro anterior */
export const RegistroAnterior: Story = {
  args: {
    origem: "anamnese",
    procedencia: "registro_anterior",
  },
};

/** Alvo sem origem de anamnese (não renderiza nada) */
export const CasoAusente: Story = {
  args: {
    origem: "sessao",
    procedencia: "relatado_responsavel",
  },
};
