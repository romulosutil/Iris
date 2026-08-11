import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConfidenceCard } from "./confidence-card";

const meta = {
  title: "05. PATTERNS/Epistemics & AI/ConfidenceCard",
  component: ConfidenceCard,
  parameters: { layout: "padded" },
  argTypes: {
    friccao: {
      control: "inline-radio",
      options: ["baixa", "media", "alta"],
    },
  },
} satisfies Meta<typeof ConfidenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BaixaFriccao: Story = {
  args: {
    titulo: "Imita bater palmas mediante instrução verbal",
    protocolo: "VB-MAPP",
    metaCodigo: "VP-MTS 3-M",
    trecho: "Durante a sessão, o paciente imitou bater palmas espontaneamente 4 de 5 vezes.",
    justificativa: "Critério de 80% de acertos atingido com clareza no registro do diário.",
    friccao: "baixa",
    confianca: 96,
    onAprovar: () => alert("Aprovado"),
    onEditar: () => alert("Editar"),
    onDescartar: () => alert("Descartar"),
  },
};

export const MediaFriccao: Story = {
  args: {
    titulo: "Mantém contato visual por 5 segundos",
    protocolo: "DENVER",
    metaCodigo: "SOC-1",
    trecho: "Manteve contato visual breve durante o jogo com blocos.",
    justificativa: "Duração exata não explicitada no relato, necessária confirmação do terapeuta.",
    friccao: "media",
    confianca: 74,
    onAprovar: () => alert("Aprovado"),
    onEditar: () => alert("Editar"),
    onDescartar: () => alert("Descartar"),
  },
};

export const AltaFriccao: Story = {
  args: {
    titulo: "Responde ao chamado pelo próprio nome a 2 metros",
    protocolo: "ABLLS-R",
    metaCodigo: "A-1",
    trecho: "Não respondeu prontamente quando a mãe chamou na recepção.",
    justificativa: "Possível contra-evidência ou registro de recusa. Risco de falso positivo.",
    friccao: "alta",
    confianca: 42,
    onAprovar: () => alert("Aprovado"),
    onEditar: () => alert("Editar"),
    onDescartar: () => alert("Descartar"),
  },
};
