import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "./drawer";
import { Button } from "./button";

const meta = {
  title: "Organisms/Drawer",
  component: Drawer,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Abrir Briefing do Paciente</Button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Briefing Rápido — Lucas Santos</DrawerTitle>
              <DrawerDescription>
                Resumo dos protocolos e observações de supervisão da última sessão.
              </DrawerDescription>
            </DrawerHeader>

            <div className="py-6 flex flex-col gap-4 text-sm text-[var(--text-primary)]">
              <p><strong>Idade:</strong> 6 anos</p>
              <p><strong>Protocolo Ativo:</strong> Comunicação Alternativa (PECS)</p>
              <p><strong>Metas da Semana:</strong> 4/5 metas concluídas</p>
            </div>

            <DrawerFooter>
              <Button variante="terciaria" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button variante="primaria" onClick={() => setOpen(false)}>
                Confirmar Leitura
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    );
  },
};
