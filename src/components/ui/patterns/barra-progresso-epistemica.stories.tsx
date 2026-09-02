import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarraProgressoEpistemica } from "./barra-progresso-epistemica";

const meta = {
  title: "05. PATTERNS/Epistemics & AI/BarraProgressoEpistemica",
  component: BarraProgressoEpistemica,
  parameters: { layout: "padded" },
  argTypes: {
    rotulo: { control: "text" },
    total: { control: { type: "number", min: 0 } },
    conquistados: { control: { type: "number", min: 0 } },
    candidatos: { control: { type: "number", min: 0 } },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarraProgressoEpistemica>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Misto: Story = {
  args: { rotulo: "Domínio mando", total: 6, conquistados: 3, candidatos: 1 },
};

export const SoCandidatos: Story = {
  args: { rotulo: "Domínio tato", total: 4, conquistados: 0, candidatos: 2 },
};

export const Completo: Story = {
  args: { rotulo: "Domínio ecoico", total: 5, conquistados: 5, candidatos: 0 },
};

export const Vazio: Story = {
  args: {
    rotulo: "Domínio intraverbal",
    total: 0,
    conquistados: 0,
    candidatos: 0,
  },
};
