import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Progress } from "./progress";

const meta = {
  title: "ATOMS/Progress",
  component: Progress,
  parameters: { layout: "padded" },
  args: { value: 60 },
  argTypes: { value: { control: { type: "range", min: 0, max: 100 } } },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dossie: Story = {
  render: (args) => (
    <div className="max-w-md">
      <div className="font-display text-ink mb-2 flex justify-between text-sm font-semibold">
        <span>Dossiê da avaliação</span>
        <span>{args.value}%</span>
      </div>
      <Progress value={args.value} aria-label="Progresso do dossiê" />
    </div>
  ),
};
