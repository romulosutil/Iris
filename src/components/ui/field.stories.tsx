import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
