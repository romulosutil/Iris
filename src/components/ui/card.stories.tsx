import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "./card";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Card",
  component: Card,
  parameters: { layout: "centered" },
  argTypes: {
    estado: { control: "inline-radio", options: ["conquistado", "candidato", "sugerida"] },
    interativo: { control: "boolean" },
    destacado: { control: "boolean" },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conquistado: Story = {
  args: {
    estado: "conquistado",
    titulo: "Aponta para o objeto nomeado",
    children: "Fato consolidado — humano aprovou a evidência.",
  },
};

export const Candidato: Story = {
  args: {
    estado: "candidato",
    titulo: "Aponta para o objeto nomeado",
    children: "Sugerido pela IA — aguarda aprovação humana com afundamento visual.",
  },
};

export const Interativo: Story = {
  args: {
    estado: "conquistado",
    interativo: true,
    titulo: "Cartão Clicável de Paciente",
    children: "Hover e toque com feedback tátil de deslocamento (-2px, -2px) e sombra.",
  },
};

export const Destacado: Story = {
  args: {
    estado: "conquistado",
    destacado: true,
    titulo: "Captura rápida pendente de nota",
    children: "Sotaque dourado do /sobre para chamar atenção prioritária.",
  },
};

// Lado a lado: a diferença é estrutural (borda, fundo, hachura, selo), não só cor.
export const CandidatoVsConquistado: Story = {
  render: () => (
    <div className="flex w-[560px] max-w-full flex-col gap-4">
      <Card estado="conquistado" titulo="Imita gesto simples">
        Marco pontuado por humano na janela de avaliação.
      </Card>
      <Card estado="candidato" titulo="Imita gesto simples">
        A IA encontrou evidência candidata nesta sessão. Ainda não é conquista.
      </Card>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
