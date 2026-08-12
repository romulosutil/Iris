import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CompareRow } from "@/components/ui/patterns/compare-row";

const meta = {
  title: "ORGANISMS/CompareRow",
  component: CompareRow,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    titulo: "Nível de independência - Escovação de Dentes",
    rotuloAnterior: "Sessão 45 - 08/07/2026",
    valorAnterior: "Precisou de apoio físico total (mão sobre mão) para segurar a escova e realizar movimentos de escovação.",
    rotuloAtual: "Sessão 46 (IA Extraído) - 10/07/2026",
    valorAtual: "Executou movimentos de escovação de forma autônoma após modelagem visual pelo terapeuta.",
    divergente: true,
  },
} satisfies Meta<typeof CompareRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Divergente: Story = {};

export const Consistente: Story = {
  args: {
    divergente: false,
    titulo: "Interação com o espelho",
    valorAnterior: "Paciente sorriu e interagiu com o próprio reflexo no espelho durante a atividade.",
    valorAtual: "Paciente manteve contato visual com seu reflexo e sorriu durante o aquecimento.",
  },
};
