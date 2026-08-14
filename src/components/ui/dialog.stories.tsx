import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./dialog";
import { Button } from "./button";

const meta = {
  title: "04. UI COMPONENTS/Layout/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmarReclassificacao: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Reclassificar evidência</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Reclassificar esta evidência?</DialogTitle>
        <DialogDescription>
          Cria uma nova versão com sua justificativa. A versão anterior é
          preservada — nada é sobrescrito.
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-3">
          <DialogClose asChild>
            <Button variante="neutra">Cancelar</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Reclassificar</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Uso deliberado: confirmação de alto atrito. Focus-trap, Esc e restauração de foco vêm do Radix.",
      },
    },
  },
};
