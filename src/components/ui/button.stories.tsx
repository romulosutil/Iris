import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./button";
import {
  CheckIcon,
  PencilIcon,
  CloseIcon,
  SparkleIcon,
  CalendarPlusIcon,
  UserPlusIcon,
} from "./icon";

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
      options: ["primaria", "secundaria", "terciaria", "destrutiva"],
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

/**
 * Confirmação de ação que REMOVE ou ENCERRA (desencaixar protocolo, encerrar
 * prescrição). Fica fora da escala de ênfase: mesmo peso da secundária, paleta
 * de risco. Só para o botão que consuma a remoção — o gatilho que apenas ABRE o
 * diálogo continua terciário, e "salvar mesmo assim" (aviso, não remoção)
 * continua primário. Cor é pista redundante: o rótulo já diz o que some.
 */
export const Destrutiva: Story = {
  args: { variante: "destrutiva", children: "Desencaixar protocolo" },
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

/**
 * CTA de página — o padrão real de `/agenda`, `/pacientes` e `/equipe`.
 *
 * Antes o rótulo começava com um "+" DE TEXTO ("+ Novo Paciente"). Três
 * problemas: o leitor de tela anunciava "mais novo paciente"; o sinal herdava
 * a fonte de display e não o peso do traço do resto da iconografia; e sob
 * `forced-colors` ele continuava sendo uma letra, não uma forma.
 *
 * `asChild` (o caso do Link do Next) IGNORA `iconLeft` de propósito — o
 * elemento renderizado é o filho, e o ícone tem de morar dentro dele. O `gap`
 * e o `inline-flex items-center` vêm da classe do Button, que é aplicada ao
 * filho: as duas formas abaixo alinham igual.
 */
export const AcaoDePagina: Story = {
  name: "CTA de página (ícone + rótulo)",
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        variante="primaria"
        iconLeft={<UserPlusIcon size={18} aria-hidden focusable="false" />}
      >
        Convidar Membro
      </Button>
      <Button variante="primaria" asChild>
        <a href="#agendar">
          <CalendarPlusIcon size={18} aria-hidden focusable="false" />
          Agendar no Calendário
        </a>
      </Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
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
