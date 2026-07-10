import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "Espectro Brutal/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Aprovar sessão" },
  argTypes: {
    variante: { control: "inline-radio", options: ["primaria", "neutra"] },
    risco: { control: "inline-radio", options: ["baixo", "alto"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primaria: Story = {};

export const Neutra: Story = { args: { variante: "neutra" } };

export const RiscoAlto: Story = {
  args: { risco: "alto", children: "Reclassificar evidência" },
  parameters: {
    docs: {
      description: {
        story:
          "Deslocamento no clique maior — o atrito escala com o risco da decisão (princípio 2).",
      },
    },
  },
};

export const Desabilitado: Story = { args: { disabled: true } };

// Matriz de estados numa story só — clique para ver o Pressed; Tab para o Focus.
export const MatrizDeEstados: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variante="primaria" risco="baixo">
        Primária · risco baixo
      </Button>
      <Button variante="primaria" risco="alto">
        Primária · risco alto
      </Button>
      <Button variante="neutra">Neutra</Button>
      <Button disabled>Desabilitada</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
