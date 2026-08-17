import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stack, Cluster, Split, Grid, Container } from "./layout";
import { StatusBadge } from "./status-badge";
import { Chip } from "./chip";
import { Button } from "./button";

const meta = {
  title: "04. UI COMPONENTS/Layout/Layout",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StackVertical: Story = {
  render: () => (
    <Stack gap="md" className="max-w-md">
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Diário
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Evidências
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Protocolo
      </div>
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

export const GridResponsivo: Story = {
  render: () => (
    <Grid colunas={3} gap="md">
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 1
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 2
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 3
      </div>
    </Grid>
  ),
};

export const ContainerCentralizado: Story = {
  render: () => (
    <Container
      largura="md"
      className="font-body border-2 border-dashed border-[var(--border-brutal)] py-6 text-center text-[var(--text-primary)]"
    >
      Container com largura máxima controlada (max-w-5xl) e padding responsivo.
    </Container>
  ),
};

export const SplitTituloEstado: Story = {
  render: () => (
    <Split className="max-w-lg rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        Imita gesto simples
      </h3>
      <StatusBadge estado="sugerida" />
    </Split>
  ),
};
