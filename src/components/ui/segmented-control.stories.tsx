import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SegmentedControl } from "./segmented-control";

const meta = {
  title: "MOLECULES/SegmentedControl",
  component: SegmentedControl,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    defaultValue: "semana",
    opcoes: [
      { value: "dia", label: "Dia" },
      { value: "semana", label: "Semana" },
      { value: "mes", label: "Mês" },
    ],
  },
};

export const DuasOpcoes: Story = {
  args: {
    defaultValue: "fatos",
    opcoes: [
      { value: "fatos", label: "Fatos" },
      { value: "sugestoes", label: "Sugestões IA" },
    ],
  },
};
