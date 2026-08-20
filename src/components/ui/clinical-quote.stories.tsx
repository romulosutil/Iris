import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ClinicalQuote } from "./clinical-quote";

const meta = {
  title: "01. PRIMITIVES/ClinicalQuote",
  component: ClinicalQuote,
  parameters: { layout: "padded" },
  argTypes: {
    rotulo: { control: "text" },
    texto: { control: "text" },
    evidencia: { control: "text" },
  },
} satisfies Meta<typeof ClinicalQuote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    rotulo: "Trecho do relato",
    texto:
      "Episódio durante momento de frustração e transição de atividade: necessidade de bloqueio de comportamento autolesivo leve (bater a mão na cabeça). Terapeuta realizou bloqueio e regulação.",
    evidencia: "necessidade de bloqueio de comportamento autolesivo leve",
  },
};

export const SemDestaque: Story = {
  args: {
    rotulo: "Trecho do relato",
    texto:
      "Paciente relatou que durante a semana teve pensamentos recorrentes de desesperança ao acordar, sem menção a planejamento ativo.",
  },
};

export const CustomRotulo: Story = {
  args: {
    rotulo: "Registro da sessão #14",
    texto:
      "Durante a dinâmica em grupo, paciente expressou agressividade verbal direcionada ao colega após disputa por brinquedo.",
    evidencia: "agressividade verbal direcionada ao colega",
  },
};
