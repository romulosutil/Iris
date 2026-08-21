import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHeader } from "./page-header";
import { Button } from "./button";
import { StatusBadge } from "./status-badge";

const meta = {
  title: "04. UI COMPONENTS/Layout/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    title: "Central de Validação",
    description: "Gerencie e valide evidências pendentes da equipe.",
  },
};

export const ComAcoes: Story = {
  args: {
    title: "Ficha Clínica do Paciente",
    description: "Gabriel Costa · 5 anos · TEA Nível 2",
    badge: <StatusBadge estado="aprovada" />,
    actions: (
      <>
        <Button variante="secundaria" tamanho="sm">
          Exportar Relatório
        </Button>
        <Button variante="primaria" tamanho="sm">
          Nova Evolução
        </Button>
      </>
    ),
  },
};

export const ComContadorDeFila: Story = {
  args: {
    title: "Fila de Validação",
    description:
      "A IA anotou 3 sugestões de sessões. Pronto para validar com seu olhar clínico?",
  },
};
