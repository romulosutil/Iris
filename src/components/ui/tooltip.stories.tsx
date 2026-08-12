import type { Meta } from "@storybook/nextjs-vite";
import { Tooltip } from "./tooltip";
import { Button } from "./button";

const meta = {
  title: "MOLECULES/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;

export default meta;

export const Padrao = {
  render: () => (
    <div className="p-12 flex justify-center">
      <Tooltip conteudo="Confiança da IA: 98% (Alta precisão)">
        <Button variante="secundaria">Passe o mouse aqui</Button>
      </Tooltip>
    </div>
  ),
};
