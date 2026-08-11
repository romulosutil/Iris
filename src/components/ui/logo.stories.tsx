import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Logo } from "./logo";

const meta = {
  title: "02. FOUNDATIONS/Logo",
  component: Logo,
  parameters: { layout: "centered" },
  args: { variante: "completo", tom: "cor", altura: 56, animado: false },
  argTypes: {
    variante: {
      control: "inline-radio",
      options: ["completo", "marca", "wordmark"],
    },
    tom: { control: "inline-radio", options: ["cor", "mono"] },
    altura: { control: { type: "range", min: 24, max: 160, step: 4 } },
    animado: { control: "boolean" },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completo: Story = {};

export const Marca: Story = { args: { variante: "marca", altura: 96 } };

export const Wordmark: Story = { args: { variante: "wordmark", altura: 48 } };

export const Animado: Story = {
  args: { variante: "marca", altura: 120, animado: true },
  parameters: {
    docs: {
      description: {
        story:
          "Anéis entram em cascata na montagem. Recarregue a story para rever; some com prefers-reduced-motion.",
      },
    },
  },
};

// Todas as variações lado a lado.
export const Variacoes: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-8">
        <Logo variante="completo" altura={48} />
        <Logo variante="marca" altura={64} />
        <Logo variante="wordmark" altura={40} />
      </div>
      <div className="flex flex-wrap items-end gap-8">
        <Logo variante="completo" altura={48} tom="mono" className="text-ink" />
        <Logo
          variante="marca"
          altura={64}
          tom="mono"
          className="text-graphite"
        />
      </div>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

// Mono sobre fundo escuro (currentColor = canvas claro).
export const SobreFundoEscuro: Story = {
  render: () => (
    <div className="bg-ink-anchor flex items-center gap-8 p-10">
      <Logo
        variante="completo"
        altura={48}
        tom="mono"
        className="text-canvas"
      />
      <Logo variante="marca" altura={64} tom="mono" className="text-canvas" />
    </div>
  ),
  parameters: {
    controls: { disable: true },
    backgrounds: { value: "surface" },
  },
};
