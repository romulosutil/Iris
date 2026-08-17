import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MetricCard } from "./metric-card";

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
