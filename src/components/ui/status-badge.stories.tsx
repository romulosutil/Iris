import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatusBadge, StatusDot, type EstadoDado } from "./status-badge";

const estados: EstadoDado[] = [
  "sugerida",
  "aprovada",
  "reclassificada",
  "devolvida",
];

const meta = {
  title: "Espectro Brutal/StatusBadge",
  component: StatusBadge,
  parameters: { layout: "centered" },
  args: { estado: "sugerida" },
  argTypes: {
    estado: { control: "inline-radio", options: estados },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sugerida: Story = {
  args: { estado: "sugerida" },
  parameters: {
    docs: {
      description: {
        story:
          "Candidato da IA: contorno tracejado violeta, sem fill sólido — nunca se parece com um estado consolidado (princípio 1).",
      },
    },
  },
};

export const Aprovada: Story = { args: { estado: "aprovada" } };
export const Reclassificada: Story = { args: { estado: "reclassificada" } };
export const Devolvida: Story = { args: { estado: "devolvida" } };

export const TodosOsEstados: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {estados.map((e) => (
        <StatusBadge key={e} estado={e} />
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const Dots: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {estados.map((e) => (
        <StatusDot key={e} estado={e} />
      ))}
    </div>
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Variante compacta para listas/tabelas densas: ponto + texto sempre juntos (cor nunca sozinha).",
      },
    },
  },
};
