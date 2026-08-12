import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EvidenceTimeline } from "./evidence-timeline";

const meta = {
  title: "MOLECULES/EvidenceTimeline",
  component: EvidenceTimeline,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { className: "w-[360px]" },
} satisfies Meta<typeof EvidenceTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    itens: [
      {
        tipo: "fato-success",
        titulo: "Contato visual sustentado",
        descricao: "Manteve olhar por ~4s durante a brincadeira dirigida.",
      },
      {
        tipo: "fato-brand",
        titulo: "Iniciou interação",
        descricao: "Chamou a terapeuta apontando para o brinquedo.",
      },
      {
        tipo: "sugestao",
        titulo: "Possível resposta a nome",
        descricao: "Sugestão da IA — revisar antes de virar registro.",
      },
    ],
  },
};

export const ApenasFatos: Story = {
  args: {
    itens: [
      { tipo: "fato-success", titulo: "Sentou na roda", descricao: "Sem apoio." },
      { tipo: "fato-success", titulo: "Seguiu instrução simples" },
    ],
  },
};
