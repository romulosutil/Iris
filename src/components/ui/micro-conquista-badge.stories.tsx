import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MicroConquistaBadge } from "./micro-conquista-badge";

const meta = {
  title: "05. PATTERNS/System States & Badges/MicroConquistaBadge",
  component: MicroConquistaBadge,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MicroConquistaBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Marco VB-MAPP Conquistado!",
    icon: "sparkle",
    animated: true,
  },
};

export const SessionApproved: Story = {
  args: {
    children: "Evidência Factual Aprovada",
    icon: "check",
    animated: false,
  },
};
