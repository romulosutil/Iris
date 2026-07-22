import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Avatar, AvatarFallback, AvatarGroup } from "./avatar";

const meta = {
  title: "Atoms/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Iniciais: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>RS</AvatarFallback>
    </Avatar>
  ),
};

export const EquipeDeCuidado: Story = {
  render: () => (
    <AvatarGroup rotulo="Equipe de cuidado">
      <Avatar>
        <AvatarFallback>RS</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MC</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Quadrados de canto vivo com leve sobreposição; a borda âncora separa cada membro.",
      },
    },
  },
};
