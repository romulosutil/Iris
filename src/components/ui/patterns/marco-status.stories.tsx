import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MarcoStatus } from "./marco-status";

const meta = {
  title: "05. PATTERNS/Epistemics & AI/MarcoStatus",
  component: MarcoStatus,
  parameters: { layout: "padded" },
  argTypes: {
    estado: {
      control: "radio",
      options: ["conquistado", "candidato", "nao_atingido"],
    },
    nome: { control: "text" },
    nivel: { control: "text" },
    rotuloVisivel: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="max-w-[9rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarcoStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conquistado: Story = {
  args: {
    estado: "conquistado",
    nome: "Pede item preferido",
    nivel: "1",
  },
};

/**
 * Candidato a domínio = fato humano ainda não consolidado. Âmbar-neutro com
 * hachura — nunca o violeta de "sugerido pela IA" (DS-02).
 */
export const CandidatoADominio: Story = {
  args: {
    estado: "candidato",
    nome: "Pede com duas palavras",
    nivel: "2",
  },
};

export const NaoAtingido: Story = {
  args: {
    estado: "nao_atingido",
    nome: "Pede informação",
    nivel: null,
  },
};

export const RotuloVisivel: Story = {
  args: {
    estado: "candidato",
    nome: "Imita gesto com objeto",
    nivel: "2",
    rotuloVisivel: true,
  },
};

export const OsTresEstados: Story = {
  args: { estado: "conquistado", nome: "—" },
  decorators: [
    () => (
      <ul className="grid max-w-md grid-cols-3 gap-3">
        <li>
          <MarcoStatus
            estado="conquistado"
            nome="Pede item preferido"
            nivel="1"
          />
        </li>
        <li>
          <MarcoStatus
            estado="candidato"
            nome="Pede com duas palavras"
            nivel="2"
          />
        </li>
        <li>
          <MarcoStatus estado="nao_atingido" nome="Pede informação" />
        </li>
      </ul>
    ),
  ],
};
