import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RadioCards } from "./radio-cards";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/RadioCards",
  component: RadioCards,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof RadioCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opcoes: [
      {
        value: "titular_adulto",
        label: "O próprio paciente",
        description: "Titular adulto (maior de 18 anos)",
      },
      {
        value: "responsavel_legal",
        label: "Responsável legal",
        description: "Pai, mãe ou tutor (menor de 18 anos ou sob curatela)",
      },
    ],
  },
};

export const ComSelecao: Story = {
  args: {
    value: "responsavel_legal",
    opcoes: [
      {
        value: "titular_adulto",
        label: "O próprio paciente",
        description: "Titular adulto (maior de 18 anos)",
      },
      {
        value: "responsavel_legal",
        label: "Responsável legal",
        description: "Pai, mãe ou tutor (menor de 18 anos ou sob curatela)",
      },
    ],
  },
};

export const ComErro: Story = {
  args: {
    error: true,
    opcoes: [
      {
        value: "titular_adulto",
        label: "O próprio paciente",
        description: "Titular adulto (maior de 18 anos)",
      },
      {
        value: "responsavel_legal",
        label: "Responsável legal",
        description: "Pai, mãe ou tutor (menor de 18 anos ou sob curatela)",
      },
    ],
  },
};
