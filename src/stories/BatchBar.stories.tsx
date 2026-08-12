import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { BatchBar } from "@/components/ui/patterns/batch-bar";

const meta = {
  title: "ORGANISMS/BatchBar",
  component: BatchBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    selecionadosContagem: 5,
    totalItens: 12,
    onAprovarLote: fn(),
    onCancelarSelecao: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative min-h-[250px] p-8 w-full bg-gray-100">
        <div className="text-center text-xs text-gray-500 font-mono mt-2">
          [Simulação da tela de revisão com a BatchBar fixada no rodapé]
        </div>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BatchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Carregando: Story = {
  args: {
    isLoading: true,
  },
};
