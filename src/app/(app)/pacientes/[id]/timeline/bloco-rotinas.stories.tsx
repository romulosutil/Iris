import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BlocoRotinas } from "./bloco-rotinas";

const meta: Meta<typeof BlocoRotinas> = {
  title: "05. PATTERNS/Clinical & Schedules/BlocoRotinas",
  component: BlocoRotinas,
  parameters: { layout: "padded" },
  args: { papel: "coordenador", onTentarDeNovo: () => {} },
};
export default meta;

type Story = StoryObj<typeof BlocoRotinas>;

const ETAPAS = [
  {
    ordinal: 0,
    descricao: "Abrir a lancheira",
    nivelAjuda: "independente",
    naoClassificado: false,
  },
  {
    ordinal: 1,
    descricao: "Abrir o pote",
    nivelAjuda: "ajuda física parcial",
    naoClassificado: false,
  },
  {
    ordinal: 2,
    descricao: "Apontar o suco",
    nivelAjuda: "ajuda gestual",
    naoClassificado: false,
  },
];

/** Rotina ancorada numa meta: entra na evolução, e a tela diz isso. */
export const Ancorada: Story = {
  args: {
    rotinas: [
      {
        extractionId: "ext_1",
        nome: "Lanche",
        sessionNumero: 7,
        dataSessao: new Date("2026-09-01T13:00:00Z"),
        ancorada: true,
        metaDescricao: "Alimentar-se com autonomia",
        etapas: ETAPAS,
      },
    ],
  },
};

/**
 * Cadeia aprovada SEM âncora: registro válido (R2.5), mas fora do gráfico.
 * Dito em texto para que o coordenador não suponha o contrário (US-2).
 */
export const SemAncora: Story = {
  args: {
    rotinas: [
      {
        extractionId: "ext_2",
        nome: "Lavar as mãos",
        sessionNumero: 6,
        dataSessao: new Date("2026-08-28T13:00:00Z"),
        ancorada: false,
        metaDescricao: null,
        etapas: ETAPAS.slice(0, 2),
      },
    ],
  },
};

/**
 * Nível de ajuda que a `taxonomia_ajuda` do protocolo não conhece (G-6 (a)):
 * aparece como NÃO CLASSIFICADO, com o nível cru — nunca vira ordinal 0, que
 * seria "independente", o melhor resultado possível.
 */
export const NivelNaoClassificado: Story = {
  args: {
    rotinas: [
      {
        extractionId: "ext_3",
        nome: "Escovar os dentes",
        sessionNumero: 5,
        dataSessao: new Date("2026-08-21T13:00:00Z"),
        ancorada: true,
        metaDescricao: "Higiene bucal",
        etapas: [
          {
            ordinal: 0,
            descricao: "Enxaguar",
            nivelAjuda: "quase sozinho",
            naoClassificado: true,
          },
        ],
      },
    ],
  },
};

/** Leitura respondeu vazio: não há rotina registrada. Afirmação verdadeira. */
export const Vazio: Story = { args: { rotinas: [] } };

/**
 * Leitura FALHOU. Estado de erro, nunca o vazio: "não sabemos" e "não há" não
 * compartilham componente (R4.3).
 */
export const FalhaDeLeitura: Story = { args: { rotinas: null } };
