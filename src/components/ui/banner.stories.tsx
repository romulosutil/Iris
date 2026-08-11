import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Banner } from "./banner";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Banner",
  component: Banner,
  parameters: { layout: "centered" },
  args: { className: "w-[480px] max-w-full" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["info", "alerta", "sucesso"],
    },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    variant: "info",
    titulo: "Aviso de Coordenação",
    children: "Sessões marcadas como 'consolidada' não podem ser excluídas sem permissão.",
  },
};

export const Alerta: Story = {
  args: {
    variant: "alerta",
    titulo: "Atenção Necessária",
    children: "Existem 4 sessões críticas pendentes de validação há mais de 48 horas.",
  },
};

export const Sucesso: Story = {
  args: {
    variant: "sucesso",
    titulo: "Sincronização Completa",
    children: "Todos os diários offline deste aparelho foram enviados com sucesso.",
  },
};
