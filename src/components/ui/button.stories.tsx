import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { CheckIcon, PencilIcon, CloseIcon, SparkleIcon } from "./icon";

const meta = {
  title: "03. PRIMITIVES/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    children: "Aprovar sessão",
    // 👇 Spy global: capturado em todas as stories
    onClick: fn(),
  },
  argTypes: {
    variante: {
      control: "inline-radio",
      options: ["primaria", "secundaria", "terciaria"],
    },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primaria: Story = {};

export const Secundaria: Story = {
  args: { variante: "secundaria", children: "Editar" },
};

export const Terciaria: Story = {
  args: { variante: "terciaria", children: "Cancelar" },
};

export const Desabilitado: Story = { args: { disabled: true } };

/**
 * Testa que um botão desabilitado:
 * 1. Não dispara `onClick` mesmo quando o usuário clica nele.
 */
export const Disabled: Story = {
  name: "Disabled (Interaction Test)",
  args: {
    disabled: true,
    children: "Button",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: /button/i });

    // 👇 Simula comportamento
    await userEvent.click(button);

    // 👇 Verifica que o handler não foi chamado
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

// Escala de ênfase numa story só: primária (fill ouro, peso) → secundária
// (fill branco, mesmo peso) → terciária (leve, sem sombra). Clique = Pressed.
export const EscalaDeEnfase: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variante="primaria">Aprovar</Button>
      <Button variante="secundaria">Editar</Button>
      <Button variante="terciaria">Cancelar</Button>
      <Button disabled>Desabilitada</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const ComIcones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button iconLeft={<SparkleIcon className="h-4 w-4" />}>
        Gerar Sugestões
      </Button>
      <Button
        variante="secundaria"
        iconRight={<CheckIcon className="h-4 w-4" />}
      >
        Confirmar
      </Button>
    </div>
  ),
};

export const ApenasIcone: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        iconOnly
        aria-label="Editar item"
        iconLeft={<PencilIcon className="h-5 w-5" />}
      />
      <Button
        iconOnly
        formato="circular"
        aria-label="Fechar diálogo"
        iconLeft={<CloseIcon className="h-5 w-5" />}
      />
    </div>
  ),
};

export const DiferentesTamanhos: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-gray-500">
          Tamanho sm (44px target)
        </span>
        <Button tamanho="sm">Salvar</Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-gray-500">
          Tamanho md (Padrão - 48px)
        </span>
        <Button tamanho="md">Salvar</Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-gray-500">
          Tamanho lg (56px target)
        </span>
        <Button tamanho="lg">Salvar</Button>
      </div>
    </div>
  ),
};

export const Carregamento: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button isLoading>Aprovar</Button>
      <Button variante="secundaria" isLoading>
        Editar
      </Button>
      <Button tamanho="sm" isLoading>
        Pequeno
      </Button>
      <Button tamanho="lg" isLoading>
        Grande
      </Button>
    </div>
  ),
};
