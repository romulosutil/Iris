import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Indicator } from "./indicator";

const meta = {
  title: "ATOMS/Indicator",
  component: Indicator,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Indicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    variant: "info",
  },
};

export const Conquistado: Story = {
  args: {
    variant: "conquistado",
  },
};

export const Sugerido: Story = {
  args: {
    variant: "sugerido",
  },
};

export const Erro: Story = {
  args: {
    variant: "erro",
  },
};
