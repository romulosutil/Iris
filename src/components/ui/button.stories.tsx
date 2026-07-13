import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "Espectro Brutal/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Aprovar sessão" },
  argTypes: {
    variante: {
      control: "inline-radio",
      options: ["primaria", "secundaria", "terciaria"],
    },
    risco: { control: "inline-radio", options: ["baixo", "alto"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primaria: Story = {};

export const Secundaria: Story = { args: { variante: "secundaria", children: "Editar" } };

export const Terciaria: Story = { args: { variante: "terciaria", children: "Cancelar" } };

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

// Escala de ênfase numa story só: primária (fill ouro, peso) → secundária
// (fill branco, mesmo peso) → terciária (leve, sem sombra). Clique = Pressed.
export const EscalaDeEnfase: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variante="primaria">Aprovar</Button>
      <Button variante="secundaria">Editar</Button>
      <Button variante="terciaria">Cancelar</Button>
      <Button variante="primaria" risco="alto">
        Reclassificar
      </Button>
      <Button disabled>Desabilitada</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
