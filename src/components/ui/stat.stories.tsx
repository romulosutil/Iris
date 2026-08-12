import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stat } from "./stat";

const meta = {
  title: "MOLECULES/Stat",
  component: Stat,
  parameters: { layout: "centered" },
  args: { rotulo: "Aguardando revisão", valor: "12" },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const ComDescricao: Story = {
  args: {
    rotulo: "Aprovação sem edição",
    valor: "74%",
    descricao: "Meta de ativação ≥70%",
  },
};
