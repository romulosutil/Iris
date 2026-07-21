import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Slider } from "./slider";

const meta = {
  title: "Atoms/Slider",
  component: Slider,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  render: () => (
    <div className="w-80">
      <Slider defaultValue={[40]} max={100} step={1} aria-label="Confiança" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Thumb quadrado (canto vivo), trilho borda âncora, preenchimento ouro.",
      },
    },
  },
};
