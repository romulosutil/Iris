import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "./card";

const meta = {
  title: "Espectro Brutal/Card",
  component: Card,
  parameters: { layout: "centered" },
  argTypes: {
    estado: { control: "inline-radio", options: ["conquistado", "candidato"] },
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
    children: "Sugerido pela IA — aguarda aprovação humana.",
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
