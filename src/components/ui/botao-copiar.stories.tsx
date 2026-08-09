import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BotaoCopiar } from "./botao-copiar";

const BR_CODE_EXEMPLO =
  "00020126580014BR.GOV.BCB.PIX0136f5b1c0de-0000-4000-a000-000000000abc5204000053039865802BR5913CLINICA IRIS6008SAOPAULO62070503***6304AB12";

const meta = {
  title: "Atoms/BotaoCopiar",
  component: BotaoCopiar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    valor: BR_CODE_EXEMPLO,
    rotulo: "Copiar código Pix",
  },
  argTypes: {
    valor: { control: "text" },
    rotulo: { control: "text" },
  },
} satisfies Meta<typeof BotaoCopiar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};

export const RotuloCurto: Story = {
  args: { valor: "IRIS-2026-XKCD", rotulo: "Copiar chave" },
};

/**
 * O componente nunca é o único caminho: o valor precisa continuar visível na
 * tela para cópia manual — é o que salva quem está em contexto sem
 * `navigator.clipboard` (HTTP, WebView restrita, permissão negada).
 */
export const ComOValorVisivel: Story = {
  render: (args) => (
    <div className="flex w-[420px] max-w-full flex-col gap-2">
      <p className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/40 bg-[var(--surface-muted)] p-2 font-mono text-xs break-all">
        {args.valor}
      </p>
      <BotaoCopiar {...args} />
    </div>
  ),
  parameters: { controls: { disable: true } },
};
