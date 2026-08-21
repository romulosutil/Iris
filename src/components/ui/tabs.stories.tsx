import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/Tabs",
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
      <TabsContent value="fila">
        12 evidências aguardando validação.
      </TabsContent>
      <TabsContent value="perfil">Dados clínicos do paciente.</TabsContent>
      <TabsContent value="historico">Versões e reclassificações.</TabsContent>
    </Tabs>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Aba ativa: acento ouro discreto (underline de 3px) + superfície neutra elevada e texto em alto contraste.",
      },
    },
  },
};

export const MultiplasAbas: Story = {
  render: () => (
    <Tabs defaultValue="aba1" className="max-w-2xl">
      <TabsList>
        <TabsTrigger value="aba1">Visão Geral</TabsTrigger>
        <TabsTrigger value="aba2">PEI & Metas</TabsTrigger>
        <TabsTrigger value="aba3">Comportamento</TabsTrigger>
        <TabsTrigger value="aba4">Relatórios</TabsTrigger>
      </TabsList>
      <TabsContent value="aba1">Conteúdo da Visão Geral.</TabsContent>
      <TabsContent value="aba2">Conteúdo do PEI & Metas.</TabsContent>
      <TabsContent value="aba3">Conteúdo de Comportamento.</TabsContent>
      <TabsContent value="aba4">Conteúdo dos Relatórios.</TabsContent>
    </Tabs>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Exemplo com múltiplas abas demonstrando consistência visual e ausência de layout shift ao alternar abas ativas.",
      },
    },
  },
};
