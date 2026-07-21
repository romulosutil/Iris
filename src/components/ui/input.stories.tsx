import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";

const meta = {
  title: "Atoms/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: { placeholder: "nome@clinica.com.br" },
  argTypes: {
    disabled: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ComValor: Story = {
  args: { defaultValue: "ana.terapeuta@clinica.com.br" },
};

export const Foco: Story = {
  parameters: {
    docs: {
      description: {
        story: "Tab até o campo para ver o anel de foco ortogonal (AAA).",
      },
    },
  },
};

export const Erro: Story = {
  args: { "aria-invalid": true, defaultValue: "sem-arroba" },
  parameters: {
    docs: {
      description: {
        story:
          "Sinal de erro é estrutural (borda) — a mensagem redundante vive no <Field>.",
      },
    },
  },
};

export const Desabilitado: Story = {
  args: { disabled: true, defaultValue: "bloqueado" },
};

// Matriz de estados numa story só.
export const MatrizDeEstados: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Input placeholder="Default" />
      <Input defaultValue="Com valor" />
      <Input aria-invalid defaultValue="Erro" />
      <Input disabled defaultValue="Desabilitado" />
    </div>
  ),
  parameters: { controls: { disable: true } },
};
