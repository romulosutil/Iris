import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Banner } from "./banner";
import { Button } from "./button";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Banner",
  component: Banner,
  parameters: { layout: "centered" },
  args: { className: "w-[560px] max-w-full" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["info", "alerta", "sucesso", "neutro"],
    },
    formato: {
      control: "inline-radio",
      options: ["padrao", "compacto", "barra"],
    },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    variant: "info",
    titulo: "Aviso de Coordenação",
    children:
      "Sessões marcadas como 'consolidada' não podem ser excluídas sem permissão.",
  },
};

export const Alerta: Story = {
  args: {
    variant: "alerta",
    titulo: "Atenção Necessária",
    children:
      "Existem 4 sessões críticas pendentes de validação há mais de 48 horas.",
  },
};

export const Sucesso: Story = {
  args: {
    variant: "sucesso",
    titulo: "Sincronização Completa",
    children:
      "Todos os diários offline deste aparelho foram enviados com sucesso.",
  },
};

export const CompactoInfo: Story = {
  args: {
    variant: "info",
    formato: "compacto",
    children:
      "Seus 7 dias de teste começam quando você cadastrar o primeiro paciente.",
    acao: (
      <a
        href="#"
        className="text-xs font-semibold tracking-wide uppercase underline underline-offset-4 hover:text-[var(--status-info-border)]"
      >
        Cadastrar primeiro paciente →
      </a>
    ),
    dismissible: true,
  },
};

export const CompactoDispensavel: Story = {
  args: {
    variant: "info",
    formato: "compacto",
    titulo: "Período de Teste",
    children:
      "Faltam 5 dias de teste. Depois disso você paga pelo uso real das fichas ativas.",
    dismissible: true,
  },
};

export const BarraFixa: Story = {
  args: {
    variant: "info",
    formato: "barra",
    className: "w-full",
    children: "Atenção: atualização programada da plataforma Iris às 22h00.",
    dismissible: true,
  },
};
