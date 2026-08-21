import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GovernancaNav } from "./governanca-nav";

const meta = {
  title: "04. UI COMPONENTS/Navigation/GovernancaNav",
  component: GovernancaNav,
  parameters: { layout: "padded" },
} satisfies Meta<typeof GovernancaNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {},
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Central de Governança com indicador inferior em tom Amarelo Ouro (3px) na aba ativa e superfície neutra elevada.",
      },
    },
  },
};

export const ComContadores: Story = {
  args: {
    contadores: {
      validacao: 0,
      excecoes: 2,
      supervisao: 6,
      pendencias: 0,
      alertasRisco: 1,
    },
  },
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
};

export const OcultarZerados: Story = {
  args: {
    contadores: {
      validacao: 0,
      excecoes: 2,
      supervisao: 6,
      pendencias: 0,
      alertasRisco: 1,
    },
    ocultarZerados: true,
  },
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
};

export const Zerado: Story = {
  args: {
    contadores: {
      validacao: 0,
      excecoes: 0,
      supervisao: 0,
      pendencias: 0,
      alertasRisco: 0,
    },
  },
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
};

/**
 * Prova visual da redução de ansiedade: mesma carga de trabalho nas filas
 * operacionais, com e sem risco clínico ativo. Só a segunda tela deve ter
 * terracota — e só na aba Alertas de Risco.
 */
export const EstadoCalmo: Story = {
  args: {
    contadores: {
      validacao: 12,
      excecoes: 4,
      supervisao: 7,
      pendencias: 3,
      alertasRisco: 0,
    },
  },
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Central sob carga alta (26 itens) e nenhum alerta de risco aberto. Nenhum vermelho na tela: filas de IA em violeta (Validação, Exceções), filas operacionais em cinza silencioso (Supervisão, Pendências), Alertas de Risco zerado e recuado em opacidade. Trabalho a fazer ≠ erro cometido.",
      },
    },
  },
};

export const EstadoCritico: Story = {
  args: {
    contadores: {
      validacao: 12,
      excecoes: 4,
      supervisao: 7,
      pendencias: 3,
      alertasRisco: 2,
    },
  },
  render: (args) => (
    <div className="max-w-4xl">
      <GovernancaNav {...args} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mesma carga operacional, agora com 2 alertas de risco em aberto (= não reconhecidos; o alerta de risco não tem escala de gravidade, todo alerta é grave por construção). O terracota aparece uma única vez e por isso é lido em ~1 fixação ocular. Compare com o Estado Calmo: nada mais mudou de cor.",
      },
    },
  },
};

export const ContrasteCalmoVsCritico: Story = {
  args: {},
  render: () => (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
          Sem risco ativo — nenhum vermelho
        </p>
        <GovernancaNav
          activeHref="/validacao"
          contadores={{
            validacao: 12,
            excecoes: 4,
            supervisao: 7,
            pendencias: 3,
            alertasRisco: 0,
          }}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
          Com risco ativo — um único vermelho, na aba certa
        </p>
        <GovernancaNav
          activeHref="/validacao"
          contadores={{
            validacao: 12,
            excecoes: 4,
            supervisao: 7,
            pendencias: 3,
            alertasRisco: 2,
          }}
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "As duas barras lado a lado. Prova que o terracota é sinal e não ruído de fundo.",
      },
    },
  },
};
