import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GraficoEspectro } from "./grafico-espectro";
import {
  ORDEM_EIXOS,
  ROTULO_EIXO,
  type DadosEixoRadar,
  type ResultadoEspectro,
} from "@/lib/evidence/espectro";

function eixos(valores: Array<Partial<DadosEixoRadar>>): DadosEixoRadar[] {
  return ORDEM_EIXOS.map((eixo, i) => ({
    eixo,
    rotulo: ROTULO_EIXO[eixo],
    valor: 50,
    alvos: 4,
    medidos: 4,
    dominados: 0,
    candidatos: 0,
    contagemEvidencias: 8,
    ...valores[i],
  }));
}

function espectro(
  lista: Array<Partial<DadosEixoRadar>>,
  naoClassificados = 0,
  niveisNaoClassificados = 0,
): ResultadoEspectro {
  return { eixos: eixos(lista), naoClassificados, niveisNaoClassificados };
}

const meta: Meta<typeof GraficoEspectro> = {
  title: "05. PATTERNS/Clinical & Schedules/GraficoEspectro",
  component: GraficoEspectro,
};
export default meta;

type Story = StoryObj<typeof GraficoEspectro>;

/** Caso comum: os seis eixos com alvo e registro. */
export const SeisEixosMedidos: Story = {
  args: {
    sessaoAtiva: 12,
    espectro: espectro([
      { valor: 78, alvos: 6, medidos: 6, dominados: 3, contagemEvidencias: 21 },
      { valor: 54, alvos: 4, medidos: 4, dominados: 1, contagemEvidencias: 12 },
      { valor: 30, alvos: 3, medidos: 3, contagemEvidencias: 7, candidatos: 1 },
      { valor: 66, alvos: 5, medidos: 5, dominados: 2, contagemEvidencias: 15 },
      { valor: 42, alvos: 3, medidos: 3, contagemEvidencias: 9 },
      { valor: 58, alvos: 4, medidos: 4, dominados: 1, contagemEvidencias: 11 },
    ]),
  },
};

/** Com a sessão anterior: o ganho é a distância entre a linha cheia e a tracejada. */
export const ComparadoComSessaoAnterior: Story = {
  args: {
    ...SeisEixosMedidos.args,
    sessaoAnterior: 11,
    espectroAnterior: espectro([
      { valor: 58, alvos: 6, medidos: 6 },
      { valor: 54, alvos: 4, medidos: 4 },
      { valor: 30, alvos: 3, medidos: 3 },
      { valor: 78, alvos: 5, medidos: 5 },
      { valor: 42, alvos: 3, medidos: 3 },
      { valor: 44, alvos: 4, medidos: 4 },
    ]),
  },
};

/** Lacunas reais: eixo sem alvo no PEI e eixo com alvo que ninguém registrou. */
export const ComLacunas: Story = {
  args: {
    sessaoAtiva: 5,
    espectro: espectro(
      [
        { valor: 72, alvos: 4, medidos: 4, dominados: 1 },
        { valor: null, alvos: 2, medidos: 0, contagemEvidencias: 0 },
        { valor: null, alvos: 0, medidos: 0, contagemEvidencias: 0 },
        { valor: 48, alvos: 3, medidos: 3 },
        { valor: 20, alvos: 2, medidos: 1 },
        { valor: null, alvos: 0, medidos: 0, contagemEvidencias: 0 },
      ],
      2,
    ),
  },
};

/** Paciente novo: nada medido ainda. Estado nomeado, sem polígono degenerado. */
export const SemMedidaNenhuma: Story = {
  args: {
    sessaoAtiva: 1,
    espectro: espectro(
      ORDEM_EIXOS.map(() => ({
        valor: null,
        alvos: 0,
        medidos: 0,
        contagemEvidencias: 0,
      })),
    ),
  },
};
