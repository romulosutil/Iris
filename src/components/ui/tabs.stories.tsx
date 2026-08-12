import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta = {
  title: "MOLECULES/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PainelDoCoordenador: Story = {
  render: () => (
    <Tabs defaultValue="fila" className="max-w-xl">
      <TabsList>
        <TabsTrigger value="fila">Fila de revisão</TabsTrigger>
        <TabsTrigger value="perfil">Perfil</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="fila">12 evidências aguardando validação.</TabsContent>
      <TabsContent value="perfil">Dados clínicos do paciente.</TabsContent>
      <TabsContent value="historico">Versões e reclassificações.</TabsContent>
    </Tabs>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Aba ativa: acento ouro + borda inferior sólida (sinal estrutural além da cor).",
      },
    },
  },
};
