import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SourceAttributionBadge } from "./source-attribution-badge";

const meta = {
  title: "01. PRIMITIVES/SourceAttributionBadge",
  component: SourceAttributionBadge,
  parameters: { layout: "padded" },
  argTypes: {
    sessionNoteId: { control: "text" },
    numeroSessao: { control: "number" },
    rotulo: { control: "text" },
  },
} satisfies Meta<typeof SourceAttributionBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  args: {
    sessionNoteId: "9f1c4a2e-7b3d-4c8f-9a10-2b6d5e4f1c30",
    sessaoEm: new Date("2026-03-10T13:00:00Z"),
  },
};

export const ComNumeroDeSessao: Story = {
  args: {
    sessionNoteId: "9f1c4a2e-7b3d-4c8f-9a10-2b6d5e4f1c30",
    sessaoEm: new Date("2026-03-10T13:00:00Z"),
    numeroSessao: 45,
  },
};

/**
 * A nota existe mas `numero_sequencial_paciente` ainda não foi consolidado —
 * o badge omite o número em vez de inventar um.
 */
export const SemNumeroDeSessao: Story = {
  args: {
    sessionNoteId: "1a2b3c4d-5e6f-4718-8901-2b3c4d5e6f70",
    sessaoEm: "2026-01-22T18:30:00Z",
    numeroSessao: null,
  },
};

export const RotuloCustomizado: Story = {
  args: {
    sessionNoteId: "1a2b3c4d-5e6f-4718-8901-2b3c4d5e6f70",
    sessaoEm: new Date("2025-11-05T12:00:00Z"),
    numeroSessao: 12,
    rotulo: "Fonte",
  },
};
