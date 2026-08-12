import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ConfidenceCard } from "@/components/ui/patterns/confidence-card";

const meta = {
  title: "ORGANISMS/ConfidenceCard",
  component: ConfidenceCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    titulo: "Comportamento Estereotipado Detectado",
    sugestao: "Paciente balançou as mãos repetidamente por 15 segundos após estímulo visual.",
    confianca: "alta",
    origem: "Diário de bordo - Seção de Fisioterapia - 14/07/2026",
    onAprovar: fn(),
    onEditar: fn(),
    onRejeitar: fn(),
  },
  argTypes: {
    confianca: {
      control: "inline-radio",
      options: ["alta", "media", "baixa"],
    },
  },
} satisfies Meta<typeof ConfidenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AltaConfianca: Story = {
  args: {
    confianca: "alta",
  },
};

export const MediaConfianca: Story = {
  args: {
    confianca: "media",
    titulo: "Interação Social Sugerida",
    sugestao: "Paciente compartilhou o brinquedo com o terapeuta durante a atividade lúdica.",
  },
};

export const BaixaConfianca: Story = {
  args: {
    confianca: "baixa",
    titulo: "Nova Meta de Linguagem Recomandada",
    sugestao: "Paciente emitiu som correspondente ao fonema /b/ espontaneamente.",
  },
};
