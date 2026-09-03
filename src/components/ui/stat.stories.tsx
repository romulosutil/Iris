import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stat } from "./stat";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/Stat",
  component: Stat,
  parameters: { layout: "centered" },
  args: { rotulo: "Aguardando revisão", valor: "12" },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const ComDescricao: Story = {
  args: {
    rotulo: "Aprovação sem edição",
    valor: "74%",
    descricao: "Meta de ativação ≥70%",
  },
};

/**
 * Modo admin (#566): mesma célula sob os tokens de `[data-mode="admin"]`,
 * escopados por elemento como no layout do backoffice.
 */
export const ModoAdmin: Story = {
  render: () => (
    <div data-mode="admin" className="bg-[var(--bg-app)] p-6">
      <Stat
        rotulo="Webhooks recebidos"
        valor="1.284"
        descricao="Últimas 24h, após deduplicação"
      />
    </div>
  ),
};
