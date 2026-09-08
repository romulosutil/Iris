import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";
import { Field } from "./field";
import { Input } from "./input";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/Field",
  component: Field,
  parameters: { layout: "centered" },
  args: {
    label: "E-mail",
    htmlFor: "email",
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemErro: Story = {
  render: (args) => (
    <div className="w-72">
      <Field {...args}>
        <Input
          id={args.htmlFor}
          type="email"
          placeholder="nome@clinica.com.br"
        />
      </Field>
    </div>
  ),
};

/**
 * Campo com botão acoplado (`acao`) — o padrão de "editar um valor já salvo"
 * (ex.: "Alterar carga semanal" + "Atualizar carga"). O botão fica na LINHA do
 * input e a dica desce abaixo da linha inteira; pôr o botão como irmão do
 * `<Field>` alinhava pelo fim da dica, uma linha de texto abaixo do input.
 */
export const ComAcao: Story = {
  args: {
    label: "Alterar carga semanal",
    htmlFor: "horas",
    hint: "Vigente desde 01/08/2026",
  },
  render: (args) => (
    <div className="w-96">
      <Field
        {...args}
        acao={
          <Button type="button" variante="secundaria" tamanho="sm">
            Atualizar carga
          </Button>
        }
      >
        <Input id={args.htmlFor} type="number" defaultValue={8} />
      </Field>
    </div>
  ),
};

export const ComErro: Story = {
  args: { error: "Informe um e-mail válido." },
  render: (args) => (
    <div className="w-72">
      <Field {...args}>
        <Input
          id={args.htmlFor}
          type="email"
          aria-invalid
          aria-describedby={`${args.htmlFor}-error`}
          defaultValue="sem-arroba"
        />
      </Field>
    </div>
  ),
};
