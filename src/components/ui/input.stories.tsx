import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";
import { SparkleIcon, ClockIcon } from "./icon";

const meta = {
  title: "ATOMS/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: { placeholder: "nome@clinica.com.br" },
  argTypes: {
    disabled: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
    size: {
      options: ["sm", "md", "lg"],
      control: { type: "select" },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ComValor: Story = {
  args: { defaultValue: "ana.terapeuta@clinica.com.br" },
};

export const Foco: Story = {
  parameters: {
    docs: {
      description: {
        story: "Tab até o campo para ver o anel de foco ortogonal (AAA).",
      },
    },
  },
};

export const Hover: Story = {
  parameters: {
    docs: {
      description: {
        story: "Passe o mouse por cima do campo para ver a transição de background e borda mais escura.",
      },
    },
  },
  args: { placeholder: "Passe o mouse aqui..." },
};

export const Erro: Story = {
  args: { "aria-invalid": true, defaultValue: "sem-arroba" },
  parameters: {
    docs: {
      description: {
        story:
          "Sinal de erro é estrutural (borda) — a mensagem redundante vive no <Field>.",
      },
    },
  },
};

export const Desabilitado: Story = {
  args: { disabled: true, defaultValue: "bloqueado" },
};

// Story para Variações de Tamanho
export const VariacoesDeTamanho: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Pequeno (sm - 32px)</span>
        <Input size="sm" placeholder="Nome do paciente" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Médio (md - 40px)</span>
        <Input size="md" placeholder="Nome do paciente" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Grande (lg - 48px)</span>
        <Input size="lg" placeholder="Nome do paciente" />
      </div>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

// Story para Slots e Addons
export const SlotsEAddons: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Ícone à Esquerda</span>
        <Input prefixIcon={<SparkleIcon className="text-base" />} placeholder="Buscar terapia..." />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Ícone à Direita</span>
        <Input suffixIcon={<ClockIcon className="text-base" />} placeholder="Selecione o horário" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Addon à Esquerda</span>
        <Input leftAddon="R$" placeholder="0,00" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Addon à Direita</span>
        <Input rightAddon=".com.br" placeholder="minhaclinica" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Misto (Addon + Ícone)</span>
        <Input
          leftAddon="https://"
          prefixIcon={<SparkleIcon className="text-sm" />}
          rightAddon="/painel"
          placeholder="exemplo"
        />
      </div>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

// Matriz de estados atualizada
export const MatrizDeEstados: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Default</span>
        <Input placeholder="Escreva algo..." />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Com Valor</span>
        <Input defaultValue="Paciente Ativo" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Hover (Simulado/Instrução)</span>
        <Input placeholder="Passe o mouse para ver a transição" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Erro</span>
        <Input aria-invalid defaultValue="Valor inválido" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-graphite/60 font-semibold">Desabilitado</span>
        <Input disabled defaultValue="Campo bloqueado" />
      </div>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

