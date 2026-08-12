import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Breadcrumb } from "./breadcrumb";

const meta = {
  title: "MOLECULES/Breadcrumb",
  component: Breadcrumb,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    itens: [
      { rotulo: "Pacientes", href: "/pacientes" },
      { rotulo: "João Silva", href: "/pacientes/123" },
      { rotulo: "Evolução Clínica", atual: true },
    ],
  },
};
