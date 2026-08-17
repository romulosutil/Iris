import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Pill } from "./pill";
import {
  CheckIcon,
  SparkleIcon,
  LayersIcon,
  ClockIcon,
} from "@/components/ui/icon";

const meta = {
  title: "03. PRIMITIVES/Pill",
  component: Pill,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["solid", "outline", "ghost", "inset"],
    },
    colorScheme: {
      control: "select",
      options: [
        "neutral",
        "brand",
        "menta",
        "ouro",
        "violeta",
        "azul",
        "coral",
      ],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md"],
    },
  },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SolidMenta: Story = {
  args: {
    variant: "solid",
    colorScheme: "menta",
    icon: <CheckIcon size={12} />,
    children: "Conquistado",
  },
};

export const InsetVioleta: Story = {
  args: {
    variant: "inset",
    colorScheme: "violeta",
    icon: <SparkleIcon size={12} />,
    children: "Sugerido por IA",
  },
};

export const InsetAzul: Story = {
  args: {
    variant: "inset",
    colorScheme: "azul",
    icon: <LayersIcon size={12} />,
    children: "Candidato a Marco",
  },
};

export const OutlineOuro: Story = {
  args: {
    variant: "outline",
    colorScheme: "ouro",
    icon: <ClockIcon size={12} />,
    children: "Pendente",
  },
};
