import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TabsNav } from "./tabs-nav";

const meta = {
  title: "04. UI COMPONENTS/Navigation/TabsNav",
  component: TabsNav,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TabsNav>;

export default meta;
type Story = StoryObj<typeof meta>;

const itensExemplo = [
  { href: "/pacientes/123", rotulo: "Evolução", exato: true },
  { href: "/pacientes/123/metas", rotulo: "PEI & Metas" },
  { href: "/pacientes/123/historico", rotulo: "Histórico Clínico" },
  { href: "/pacientes/123/equipe", rotulo: "Equipe" },
];

export const Padrao: Story = {
  args: {
    itens: itensExemplo,
    ariaLabel: "Navegação do Prontuário",
    activeHref: "/pacientes/123",
  },
  render: (args) => (
    <div className="max-w-3xl">
      <TabsNav {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Abas de rota com acento ouro discreto (underline de 3px) na aba ativa e superfície neutra elevada.",
      },
    },
  },
};
