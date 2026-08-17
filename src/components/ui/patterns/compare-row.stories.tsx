import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CompareRow } from "./compare-row";

const meta = {
  title: "05. PATTERNS/Epistemics & AI/CompareRow",
  component: CompareRow,
  parameters: { layout: "padded" },
  argTypes: {
    divergente: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof CompareRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Consistente: Story = {
  args: {
    rotulo: "Nível de Ajuda (Prompting)",
    dadoAnterior: "Ajuda Leve (Gesto/Apontar)",
    dadoSugerido: "Ajuda Leve (Gesto/Apontar)",
    dataAnterior: "Sessão 45",
    dataSugerida: "Sessão 46",
    divergente: false,
  },
};

export const Divergente: Story = {
  args: {
    rotulo: "Critério de Domínio (Acertos)",
    dadoAnterior: "80% de acertos independentes (4/5 tentativas)",
    dadoSugerido: "40% de acertos com ajuda física total (2/5 tentativas)",
    dataAnterior: "Sessão 45",
    dataSugerida: "Sessão 46",
    divergente: true,
    motivoDivergencia:
      "Queda no desempenho em relação à sessão anterior. Verificar se houve regressão ou mudança de terapeuta.",
  },
};
