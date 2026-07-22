import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Chip, ChipGroup } from "./chip";

const meta = {
  title: "Atoms/Chip",
  component: Chip,
  parameters: { layout: "centered" },
  args: { children: "ABA" },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Estatico: Story = { args: { children: "Fonoaudiologia" } };

export const Removivel: Story = {
  args: {
    children: "Terapia Ocupacional",
    onRemover: () => {},
    rotuloRemover: "Remover Terapia Ocupacional",
  },
};

export const FiltroSelecionavel: Story = {
  render: () => {
    const opcoes = ["ABA", "Fono", "TO", "Psicologia"];
    const [ativos, setAtivos] = useState<string[]>(["ABA"]);
    const alterna = (o: string) =>
      setAtivos((a) => (a.includes(o) ? a.filter((x) => x !== o) : [...a, o]));
    return (
      <ChipGroup rotulo="Filtrar por protocolo">
        {opcoes.map((o) => (
          <Chip
            key={o}
            selecionado={ativos.includes(o)}
            onSelecionar={() => alterna(o)}
          >
            {o}
          </Chip>
        ))}
      </ChipGroup>
    );
  },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Chips-toggle com aria-pressed; selecionado usa o acento ouro (seleção atual). Alvo de toque ≥44px.",
      },
    },
  },
};
