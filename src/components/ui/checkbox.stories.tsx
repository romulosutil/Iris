import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Checkbox } from "./checkbox";

const meta = {
  title: "Espectro Brutal/Checkbox",
  component: Checkbox,
  parameters: { layout: "centered" },
  args: { label: "Consentimento coletado" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const MarcadoPorDefault: Story = {
  args: { defaultChecked: true, label: "Reavaliar ao fim do ciclo" },
};

export const Desabilitado: Story = {
  args: { disabled: true, label: "Indisponível nesta fase" },
};

export const Lista: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Checkbox label="ABA" defaultChecked />
      <Checkbox label="Fonoaudiologia" />
      <Checkbox label="Terapia Ocupacional" />
    </div>
  ),
  parameters: { controls: { disable: true } },
};
