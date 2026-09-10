import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TabsNav } from "./tabs-nav";
import { Pill } from "./primitives/pill";
import { MenuAcoes } from "./primitives/menu-acoes";
import { StatusBadge } from "./patterns/status-badge";

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

export const ComAcoes: Story = {
  args: {
    itens: itensExemplo,
    ariaLabel: "Navegação do Prontuário",
    activeHref: "/pacientes/123/metas",
  },
  render: (args) => (
    <div className="max-w-4xl">
      <TabsNav
        {...args}
        acoes={
          <>
            <Pill
              variant="inset"
              colorScheme="neutral"
              icon={<span aria-hidden="true">🔒</span>}
            >
              Acesso restrito à equipe
            </Pill>
            <StatusBadge variante="success">Alta Concluída</StatusBadge>
            <MenuAcoes
              rotulo="Ações do prontuário"
              itens={[
                {
                  id: "alta",
                  rotulo: "Desfazer alta clínica",
                  aoSelecionar: () => {},
                },
                {
                  id: "arquivamento",
                  rotulo: "Arquivar paciente",
                  aoSelecionar: () => {},
                },
              ]}
            />
          </>
        }
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Slot `acoes`: selos de estado e menu `⋯` de ações raras da entidade, na mesma régua das abas. Quando não cabe ao lado das abas, o bloco desce para uma linha própria, alinhado à direita; no mobile dobra por dentro.",
      },
    },
  },
};
