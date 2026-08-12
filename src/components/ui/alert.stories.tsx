import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Alert } from "./alert";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Alert",
  component: Alert,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { className: "w-[420px] max-w-full" },
  argTypes: {
    severidade: {
      control: "inline-radio",
      options: ["erro", "info", "sucesso"],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Erro: Story = {
  args: {
    severidade: "erro",
    titulo: "O áudio não foi enviado",
    children:
      "Toque para tentar de novo. O diário continua salvo neste aparelho.",
  },
};

export const Info: Story = {
  args: {
    severidade: "info",
    titulo: "Primeira revisão desta sessão",
    children: "Aprove ou ajuste cada sugestão antes de virar registro.",
  },
};

export const Sucesso: Story = {
  args: {
    severidade: "sucesso",
    titulo: "Evidências aprovadas",
    children: "3 candidatas viraram registro nesta sessão.",
  },
};

// Significado nunca depende só de cor: ícone + rótulo textual em toda severidade.
export const TodasAsSeveridades: Story = {
  render: () => (
    <div className="flex w-[440px] max-w-full flex-col gap-3">
      <Alert severidade="erro" titulo="O áudio não foi enviado">
        Toque para tentar de novo.
      </Alert>
      <Alert severidade="info" titulo="Primeira revisão desta sessão">
        Aprove cada sugestão antes de virar registro.
      </Alert>
      <Alert severidade="sucesso" titulo="Evidências aprovadas">
        3 candidatas viraram registro.
      </Alert>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
