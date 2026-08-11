import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ProtocolProgressBarChart,
  ProtocolTrendChart,
  type ProtocolProgressData,
  type TrendSessionPoint,
} from "./protocol-dashboard-charts";
import { MetricCard } from "./metric-card";

const mockVbMapp: ProtocolProgressData = {
  protocoloNome: "VB-MAPP — Nível 2",
  totalMetas: 45,
  metasDominadas: 28,
  metasSugeridasIA: 8,
  tendenciaSemanal: 3,
};

const mockAblls: ProtocolProgressData = {
  protocoloNome: "ABLLS-R — Linguagem & Comunicação",
  totalMetas: 60,
  metasDominadas: 34,
  metasSugeridasIA: 12,
  tendenciaSemanal: 4,
};

const mockDenver: ProtocolProgressData = {
  protocoloNome: "DENVER II — Pessoal-Social",
  totalMetas: 30,
  metasDominadas: 22,
  metasSugeridasIA: 3,
  tendenciaSemanal: 1,
};

const mockTrendPontos: TrendSessionPoint[] = [
  { sessaoNumero: 40, evidenciasAcumuladas: 18, conquistasNoDia: 1, descricaoDestaque: "Início do protocolo de imitação motora" },
  { sessaoNumero: 41, evidenciasAcumuladas: 21, conquistasNoDia: 3, descricaoDestaque: "Domínio de 3 gestos simples" },
  { sessaoNumero: 42, evidenciasAcumuladas: 24, conquistasNoDia: 3, descricaoDestaque: "Primeiro mando independente registrado" },
  { sessaoNumero: 43, evidenciasAcumuladas: 25, conquistasNoDia: 1, descricaoDestaque: "Manutenção de contato visual consistente" },
  { sessaoNumero: 44, evidenciasAcumuladas: 28, conquistasNoDia: 3, descricaoDestaque: "Consolidação de resposta ao nome" },
  { sessaoNumero: 45, evidenciasAcumuladas: 32, conquistasNoDia: 4, descricaoDestaque: "Conquista de marco VB-MAPP VP-MTS 3-M" },
];

const meta = {
  title: "Organisms/ProtocolDashboardCharts",
  component: ProtocolProgressBarChart,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProtocolProgressBarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProgressByProtocol: Story = {
  args: {
    data: mockVbMapp,
  },
  render: () => (
    <div className="flex flex-col gap-4 max-w-xl">
      <ProtocolProgressBarChart data={mockVbMapp} />
      <ProtocolProgressBarChart data={mockAblls} />
      <ProtocolProgressBarChart data={mockDenver} />
    </div>
  ),
};

export const FactVsSuggestionComparison: Story = {
  args: {
    data: {
      protocoloNome: "Comparativo de Evidências Fato vs. Sugestão",
      totalMetas: 100,
      metasDominadas: 60,
      metasSugeridasIA: 25,
      tendenciaSemanal: 8,
    },
  },
  render: (args) => (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="p-3 bg-surface-elevated rounded border border-border-brutal text-xs text-text-secondary">
        Comparação visual: <strong>Sólido Menta</strong> indica fatos aprovados por terapeutas; <strong>Hachura Densa Violeta</strong> indica sugestões de IA candidatas a domínio aguardando revisão clínica.
      </div>
      <ProtocolProgressBarChart data={args.data} />
    </div>
  ),
};

export const DashboardExecutiveView: Story = {
  args: {
    data: mockVbMapp,
  },
  render: () => (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Linha de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          titulo="Metas Dominadas"
          valor="84"
          tendencia={{ direcao: "alta", valor: "+8" }}
        />
        <MetricCard
          titulo="Sugestões IA"
          valor="23"
          progresso={45}
        />
        <MetricCard
          titulo="Aderência Geral"
          valor="78%"
          tendencia={{ direcao: "alta", valor: "3%" }}
        />
      </div>

      {/* Gráfico de Trajetória Temporal */}
      <ProtocolTrendChart
        titulo="Evolução de Evidências Acumuladas"
        protocoloNome="Geral · Últimas 6 Sessões"
        pontos={mockTrendPontos}
      />

      {/* Barras de Progresso por Protocolo */}
      <div className="flex flex-col gap-3">
        <h4 className="font-display text-sm font-bold text-text-primary">
          Progresso Detalhado por Protocolo
        </h4>
        <ProtocolProgressBarChart data={mockVbMapp} />
        <ProtocolProgressBarChart data={mockAblls} />
      </div>
    </div>
  ),
};
