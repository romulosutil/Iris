import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./accordion";

const meta = {
  title: "Espectro Brutal/Accordion",
  component: Accordion,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CadastroClinico: Story = {
  render: () => (
    <Accordion
      type="single"
      collapsible
      defaultValue="dados"
      className="flex max-w-xl flex-col gap-3"
    >
      <AccordionItem value="dados">
        <AccordionTrigger>Dados administrativos</AccordionTrigger>
        <AccordionContent>
          Nome, responsável, consentimento versionado.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="clinico">
        <AccordionTrigger>Perfil clínico</AccordionTrigger>
        <AccordionContent>
          Diagnóstico, alergias, observações — acesso restrito por RLS.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="protocolo">
        <AccordionTrigger>Protocolo de referência</AccordionTrigger>
        <AccordionContent>Família do protocolo e metas iniciais.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Agrupa as seções do cadastro clínico denso. Teclado e ARIA vêm do Radix; o visual é 100% Espectro Brutal.",
      },
    },
  },
};

export const Multiplo: Story = {
  render: () => (
    <Accordion type="multiple" className="flex max-w-xl flex-col gap-3">
      <AccordionItem value="a">
        <AccordionTrigger>Sessão 10/07</AccordionTrigger>
        <AccordionContent>3 evidências sugeridas.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Sessão 11/07</AccordionTrigger>
        <AccordionContent>1 evidência aprovada.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  parameters: { controls: { disable: true } },
};
