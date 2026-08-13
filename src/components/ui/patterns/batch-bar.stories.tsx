import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BatchBar } from "./batch-bar";

const meta = {
  title: "05. PATTERNS/Epistemics & AI/BatchBar",
  component: BatchBar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BatchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selecionados: 5,
    totalElegiveis: 8,
    totalItens: 10,
    bloqueados: 2,
    onAprovarLote: () => alert("Aprovar lote"),
    onLimparSelecao: () => alert("Limpar seleção"),
    onSelecionarTodosElegiveis: () => alert("Selecionar todos"),
  },
};

export const NenhumSelecionado: Story = {
  args: {
    selecionados: 0,
    totalElegiveis: 8,
    totalItens: 10,
    bloqueados: 2,
    onAprovarLote: () => alert("Aprovar lote"),
    onSelecionarTodosElegiveis: () => alert("Selecionar todos"),
  },
};

export const ZeroElegiveis: Story = {
  name: "Zero elegíveis (todos exigem revisão individual)",
  args: {
    selecionados: 0,
    totalElegiveis: 0,
    totalItens: 6,
    bloqueados: 6,
    onAprovarLote: () => alert("Aprovar lote"),
    onLimparSelecao: () => alert("Limpar seleção"),
    onSelecionarTodosElegiveis: () => alert("Selecionar todos"),
  },
};
