import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stack, Cluster, Split } from "./layout";
import { StatusBadge } from "./status-badge";
import { Chip } from "./chip";
import { Button } from "./button";

const meta = {
  title: "Layout/Layout",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StackVertical: Story = {
  render: () => (
    <Stack gap="md" className="max-w-md">
      <div className="border-ink-anchor bg-surface border-2 p-3">Diário</div>
      <div className="border-ink-anchor bg-surface border-2 p-3">Evidências</div>
      <div className="border-ink-anchor bg-surface border-2 p-3">Protocolo</div>
    </Stack>
  ),
};

export const ClusterDeChips: Story = {
  render: () => (
    <Cluster gap="sm">
      <Chip>ABA</Chip>
      <Chip>Fonoaudiologia</Chip>
      <Chip>Terapia Ocupacional</Chip>
      <Chip>Psicologia</Chip>
    </Cluster>
  ),
};

export const SplitTituloEstado: Story = {
  render: () => (
    <Split className="border-ink-anchor bg-surface max-w-lg border-2 p-4">
      <h3 className="font-display text-ink-anchor text-lg font-semibold">
        Imita gesto simples
      </h3>
      <StatusBadge estado="sugerida" />
    </Split>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Split empurra título e selo para as extremidades; empilha no mobile (<40rem).",
      },
    },
  },
};

export const Composto: Story = {
  render: () => (
    <Stack gap="lg" className="max-w-lg">
      <Split className="border-ink-anchor bg-surface border-2 p-4">
        <h3 className="font-display text-ink-anchor text-lg font-semibold">
          Sessão de 12/07
        </h3>
        <StatusBadge estado="aprovada" />
      </Split>
      <Cluster gap="sm">
        <Chip selecionado onSelecionar={() => {}}>
          ABA
        </Chip>
        <Chip onSelecionar={() => {}}>Fono</Chip>
      </Cluster>
      <Cluster gap="md">
        <Button variante="neutra">Editar</Button>
        <Button>Aprovar</Button>
      </Cluster>
    </Stack>
  ),
  parameters: { controls: { disable: true } },
};
