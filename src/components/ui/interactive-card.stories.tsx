import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InteractiveCard } from "./interactive-card";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/InteractiveCard",
  component: InteractiveCard,
  parameters: { layout: "centered" },
  args: { className: "w-[360px]" },
} satisfies Meta<typeof InteractiveCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    titulo: "Sessão Diagnóstica",
    children: "Clique para visualizar o plano de intervenção correspondente.",
  },
};

export const Destacado: Story = {
  args: {
    destacado: true,
    titulo: "Ação Urgente Requerida",
    children: "Você tem 1 consolidação pendente que precisa ser realizada hoje.",
  },
};

export const ComoLink: Story = {
  args: {
    href: "https://google.com",
    titulo: "Ver no Mapa",
    children: "Ir para o link externo do Google Maps.",
  },
};
