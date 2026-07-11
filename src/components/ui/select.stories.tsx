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
  title: "Espectro Brutal/Select",
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
