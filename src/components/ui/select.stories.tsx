import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";
import { Field } from "./field";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/Select",
  component: Select,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FamiliaDeProtocolo: Story = {
  render: () => (
    <div className="w-72">
      <Field label="Família do protocolo" htmlFor="protocolo">
        <Select>
          <SelectTrigger id="protocolo" aria-label="Família do protocolo">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aba">ABA</SelectItem>
            <SelectItem value="denver">Modelo Denver</SelectItem>
            <SelectItem value="fono">Fonoaudiologia</SelectItem>
            <SelectItem value="to">Terapia Ocupacional</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Trigger com canto vivo + borda âncora; opção destacada usa o acento ouro. Typeahead e teclado vêm do Radix.",
      },
    },
  },
};

/**
 * Mesmo contrato de densidade do Input. O Radix marca `data-placeholder`
 * enquanto nada foi escolhido — esse é o repouso que recua para o grafite no
 * desktop. Escolha feita, foco ou lista aberta devolvem a borda cheia com a
 * sombra dura. Abaixo de `md`, borda de 2px e piso tátil intactos.
 */
export const DensidadeDesktop: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Field label="Sem escolha (repouso)" htmlFor="densidade-vazio">
        <Select>
          <SelectTrigger id="densidade-vazio">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aba">ABA</SelectItem>
            <SelectItem value="denver">Modelo Denver</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Com escolha" htmlFor="densidade-preenchido">
        <Select defaultValue="aba">
          <SelectTrigger id="densidade-preenchido">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aba">ABA</SelectItem>
            <SelectItem value="denver">Modelo Denver</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Erro"
        htmlFor="densidade-erro"
        error="Escolha a família do protocolo."
      >
        <Select>
          <SelectTrigger id="densidade-erro" aria-invalid>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aba">ABA</SelectItem>
            <SelectItem value="denver">Modelo Denver</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
