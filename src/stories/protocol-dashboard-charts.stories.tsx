import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ProtocolProgressBarChart,
  ProtocolTrendChart,
} from "@/components/ui/protocol-dashboard-charts";
import { Card } from "@/components/ui/card";

const meta = {
  title: "ORGANISMS/ProtocolDashboardCharts",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;

const trendData = [
  { sessao: "Sessão 1", valor: 10, info: "Ponto de partida / Sondagem inicial" },
  { sessao: "Sessão 5", valor: 15, info: "Apoio total" },
  { sessao: "Sessão 10", valor: 35, info: "Imitação motora dominada", conquista: true },
  { sessao: "Sessão 15", valor: 40 },
  { sessao: "Sessão 20", valor: 65, info: "Identificação de cores aprovada por IA", conquista: true },
  { sessao: "Sessão 25", valor: 70 },
  { sessao: "Sessão 30", valor: 85, info: "Comportamento autônomo consolidado", conquista: true },
];

// Story ProgressByProtocol: Comparative VB-MAPP, ABLLS-R, Denver
export const ProgressByProtocol: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="font-display font-black text-xl uppercase">
        Progresso por Protocolo de Referência
      </h2>
      <ProtocolProgressBarChart
        titulo="VB-MAPP - Avaliação de Marcos (Nível 1 & 2)"
        totalAlvos={45}
        conquistadosContagem={28}
        sugeridosContagem={8}
        trendBadgeTexto="+3 esta semana"
      />
      <ProtocolProgressBarChart
        titulo="ABLLS-R - Habilidades de Linguagem Básica"
        totalAlvos={120}
        conquistadosContagem={52}
        sugeridosContagem={15}
        trendBadgeTexto="+5 esta semana"
      />
      <ProtocolProgressBarChart
        titulo="ESD - Modelo Denver de Intervenção Precoce"
        totalAlvos={30}
        conquistadosContagem={12}
        sugeridosContagem={6}
        trendBadgeTexto="+1 esta semana"
      />
    </div>
  ),
};

// Story FactVsSuggestionComparison: Direct solid mint vs hatched violet comparison
export const FactVsSuggestionComparison: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-6 max-w-xl">
      <h2 className="font-display font-black text-xl uppercase">
        Eixo de Profundidade: Fato vs Sugestão IA
      </h2>
      <div className="p-4 bg-gray-50 border border-gray-300 rounded font-mono text-xs leading-relaxed">
        O Design System <strong>Espectro Brutal (§4C)</strong> exige separação clara:
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong className="text-teal-600">Sólido Menta:</strong> Fatos consolidados e comprovados.
          </li>
          <li>
            <strong className="text-purple-600">Hachurado Violeta:</strong> Sugestões propostas pela IA (candidatas).
          </li>
        </ul>
      </div>
      <ProtocolProgressBarChart
        titulo="Comparativo Direto de Evidências Acumuladas"
        totalAlvos={50}
        conquistadosContagem={35}
        sugeridosContagem={10}
      />
    </div>
  ),
};

// Story DashboardExecutiveView: Composed Grid of cards, trend chart, and progress bar
export const DashboardExecutiveView: StoryObj = {
  render: () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
      <div className="lg:col-span-3">
        <h2 className="font-display font-black text-2xl uppercase border-b-4 border-black pb-2 mb-2">
          Painel Executivo de Protocolos
        </h2>
      </div>

      {/* Metric Cards */}
      <Card titulo="Adesão ao Protocolo" estado="fact" className="flex flex-col justify-between">
        <div className="text-3xl font-black font-mono">82%</div>
        <p className="text-xs text-gray-500 mt-2">
          Consistência de preenchimento do diário clínico pelo terapeuta.
        </p>
      </Card>

      <Card titulo="Metas Conquistadas" estado="fact" className="flex flex-col justify-between">
        <div className="text-3xl font-black font-mono">28 / 45</div>
        <p className="text-xs text-gray-500 mt-2">
          Aprovadas pelo coordenador técnico da clínica.
        </p>
      </Card>

      <Card titulo="Candidatas por IA" estado="suggestion" className="flex flex-col justify-between">
        <div className="text-3xl font-black font-mono text-[#6A4C93]">8 Alvos</div>
        <p className="text-xs text-gray-500 mt-2">
          Aguardando revisão unitária ou aprovação rápida por lote.
        </p>
      </Card>

      {/* Trend Chart (Takes 2 Columns) */}
      <div className="lg:col-span-2">
        <ProtocolTrendChart titulo="Evolução Temporal do Escore Clínico" dados={trendData} />
      </div>

      {/* Progress Bar (Takes 1 Column) */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <ProtocolProgressBarChart
          titulo="Status de Domínio (VB-MAPP)"
          totalAlvos={45}
          conquistadosContagem={28}
          sugeridosContagem={8}
          trendBadgeTexto="+3"
        />
        <div className="p-4 border-2 border-black rounded-[8px] bg-amber-50 shadow-[3px_3px_0px_#000000] font-mono text-xs">
          <strong>Aviso de Auditoria:</strong> Há 3 conflitos de histórico detectados entre a última sessão e o diário de bordo.
        </div>
      </div>
    </div>
  ),
};
