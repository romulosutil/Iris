import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarraCobertura } from "./barra-cobertura";
import { calcularCobertura } from "./cobertura";

/**
 * Os quatro estados de MV3 (#203, fatia 5), montados pela MESMA função que a
 * tela e a validação de saldo usam. Nenhum story escreve número à mão: se a
 * regra de classificação mudar, o Storybook muda junto — story com dado
 * fabricado vira documentação que mente sobre o produto.
 */
const T = "terapeuta_referencia";
const alvo20 = [{ disciplina: "Fonoaudiologia", horasAlvoSemana: "20.0" }];

function cobertura(
  vinculos: { papelNaEquipe: string; horasSemana: string | null }[],
) {
  const [c] = calcularCobertura(
    alvo20,
    vinculos.map((v) => ({ disciplina: "Fonoaudiologia", ...v })),
  );
  return c!;
}

const meta = {
  title: "05. PATTERNS/Clinical & Schedules/BarraCobertura",
  component: BarraCobertura,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 380 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarraCobertura>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 0% — nenhum terapeuta vinculado. A linha em 0% é o que diz o que falta. */
export const Vazio: Story = {
  args: { cobertura: cobertura([]) },
};

/** 1–99% — em construção, com o restante exato. */
export const Parcial: Story = {
  args: {
    cobertura: cobertura([{ papelNaEquipe: T, horasSemana: "12.0" }]),
  },
};

/** 100% — a prescrição está sendo entregue. */
export const Completa: Story = {
  args: {
    cobertura: cobertura([{ papelNaEquipe: T, horasSemana: "20.0" }]),
  },
};

/** >100% — legítimo e transitório: grita, não trava, e diz como sair. */
export const Sobrealocada: Story = {
  args: {
    cobertura: cobertura([{ papelNaEquipe: T, horasSemana: "25.0" }]),
  },
};

/**
 * Vínculo legado sem carga registrada: a conta não está errada, está
 * INCOMPLETA — e isso precisa aparecer, senão o número mente em silêncio.
 */
export const ComVinculoSemHoras: Story = {
  args: {
    cobertura: cobertura([
      { papelNaEquipe: T, horasSemana: "8.0" },
      { papelNaEquipe: T, horasSemana: null },
    ]),
  },
};
