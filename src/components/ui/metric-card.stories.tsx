import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MetricCard } from "./metric-card";
import { Pill } from "./primitives/pill";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/MetricCard",
  component: MetricCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { className: "w-[260px]" },
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    titulo: "Evidências aprovadas",
    valor: 42,
    tendencia: { direcao: "alta", valor: 3 },
    progresso: 68,
  },
};

export const SemTendencia: Story = {
  args: { titulo: "Sessões pendentes", valor: 7, progresso: 20 },
};

export const SemProgresso: Story = {
  args: {
    titulo: "Reclassificações",
    valor: "12%",
    tendencia: { direcao: "baixa", valor: "2%" },
  },
};

export const Grade: Story = {
  args: { titulo: "KPIs", valor: "—" },
  render: () => (
    <div className="grid w-[560px] max-w-full grid-cols-2 gap-4">
      <MetricCard
        titulo="Evidências aprovadas"
        valor={42}
        tendencia={{ direcao: "alta", valor: 3 }}
        progresso={68}
      />
      <MetricCard titulo="Sessões pendentes" valor={7} progresso={20} />
      <MetricCard
        titulo="Reclassificações"
        valor="12%"
        tendencia={{ direcao: "baixa", valor: "2%" }}
        progresso={45}
      />
      <MetricCard titulo="Diários no mês" valor={128} progresso={90} />
    </div>
  ),
  parameters: { controls: { disable: true } },
};

/**
 * Modo admin (#566): o backoffice do super admin escopa os tokens em
 * `<div data-mode="admin">` — não no `<html>`, que segue clínico. Esta story
 * prova a mesma composição de cartão sob aquele modo, com os três slots que a
 * migração do `KpiCard` trouxe: `selo`, `descricao` e `destaque`.
 */
export const ModoAdmin: Story = {
  args: { titulo: "KPIs", valor: "—" },
  parameters: { controls: { disable: true } },
  render: () => (
    <div
      data-mode="admin"
      className="grid w-[600px] max-w-full grid-cols-2 gap-4 bg-[var(--bg-app)] p-6"
    >
      <MetricCard
        destaque
        densidade="compacta"
        titulo="MRR Estimado"
        valor="R$ 12.345,67"
        descricao="Teto estimado — não é a fatura apurada"
        selo={
          <Pill colorScheme="menta" size="sm">
            Pay-as-you-grow
          </Pill>
        }
      />
      <MetricCard
        densidade="compacta"
        titulo="Clínicas em Trial"
        valor={4}
        descricao="7 dias a partir do 1º paciente"
        selo={
          <Pill colorScheme="ouro" size="sm">
            Em Trial
          </Pill>
        }
      />
    </div>
  ),
};
