import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertaRiscoCard } from "./alerta-risco-card";
import { Button } from "@/components/ui/button";
import type { MenuAcaoItem } from "@/components/ui/primitives/menu-acoes";

const meta = {
  title: "05. PATTERNS/Alertas de Risco/AlertaRiscoCard",
  component: AlertaRiscoCard,
  parameters: { layout: "padded" },
  argTypes: {
    categoria: {
      control: "select",
      options: [
        "autolesao",
        "ideacao_suicida",
        "violencia_sofrida",
        "violencia_praticada",
        "risco_a_terceiro",
      ],
    },
    status: {
      control: "select",
      options: [
        "aberto",
        "reconhecido",
        "escalado_estagio_1",
        "escalado_estagio_2",
        "resolvido",
        "descartado",
      ],
    },
  },
} satisfies Meta<typeof AlertaRiscoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const menuCompleto: MenuAcaoItem[] = [
  { id: "resolver", rotulo: "Resolver alerta…", aoSelecionar: () => {} },
  {
    id: "descartar",
    rotulo: "Descartar alerta…",
    tom: "destrutivo",
    aoSelecionar: () => {},
  },
];

const menuSoDescarte: MenuAcaoItem[] = [
  {
    id: "descartar",
    rotulo: "Descartar alerta…",
    tom: "destrutivo",
    aoSelecionar: () => {},
  },
];

export const AutolesaoAberto: Story = {
  args: {
    pacienteNome: "Lucas Gabriel Silva",
    categoria: "autolesao",
    status: "aberto",
    trechoFonte:
      "Episódio durante momento de frustração e transição de atividade: necessidade de bloqueio de comportamento autolesivo leve (bater a mão na cabeça). Terapeuta realizou bloqueio e regulação.",
    detalhe: "necessidade de bloqueio de comportamento autolesivo leve",
    tempoRestanteFormatado: "01h 01m",
    jaVenceu: false,
    acaoPrimaria: <Button variante="primaria">Reconhecer</Button>,
    acoesSecundarias: menuCompleto,
  },
};

export const IdeacaoSuicidaReconhecido: Story = {
  args: {
    pacienteNome: "Ana Clara Souza",
    categoria: "ideacao_suicida",
    status: "reconhecido",
    trechoFonte:
      "Paciente verbalizou que 'às vezes preferia não acordar mais', mas negou planos ou intenção estruturada ao ser acolhida.",
    detalhe: "verbalizou que 'às vezes preferia não acordar mais'",
    tempoRestanteFormatado: "12m",
    jaVenceu: false,
    reconhecidoPorNome: "Dra. Maria Coordenadora",
    acaoPrimaria: <Button variante="primaria">Resolver</Button>,
    acoesSecundarias: menuSoDescarte,
  },
};

export const ViolenciaMenorComECA: Story = {
  args: {
    pacienteNome: "Pedro Henrique (7 anos)",
    categoria: "violencia_sofrida",
    status: "escalado_estagio_1",
    trechoFonte:
      "Criança relatou que tio bateu muito forte nas costas durante o final de semana, apresentando hematoma visível na região escapular.",
    detalhe: "tio bateu muito forte nas costas",
    tempoRestanteFormatado: "Prazo vencido",
    jaVenceu: true,
    avisoLegalTexto:
      "Sinalização de risco: suspeita/registro de violência contra menor. Nos termos do art. 13 do ECA e da Lei 13.431/2017, a comunicação ao Conselho Tutelar / autoridade competente é dever legal do profissional e do estabelecimento de saúde.",
    acaoPrimaria: <Button variante="primaria">Resolver</Button>,
    acoesSecundarias: menuSoDescarte,
  },
};

export const Resolvido: Story = {
  args: {
    pacienteNome: "Lucas Gabriel Silva",
    categoria: "autolesao",
    status: "resolvido",
    trechoFonte:
      "Episódio durante momento de frustração e transição de atividade: necessidade de bloqueio de comportamento autolesivo leve (bater a mão na cabeça). Terapeuta realizou bloqueio e regulação.",
    detalhe: "necessidade de bloqueio de comportamento autolesivo leve",
    condutaRegistrada:
      "Protocolo de regulação sensorial aplicado e comunicado aos pais na saída. Sem lesões físicas.",
  },
};

export const Descartado: Story = {
  args: {
    pacienteNome: "Mariana Costa",
    categoria: "autolesao",
    status: "descartado",
    trechoFonte:
      "Paciente citou metáfora sobre 'se cortar por dentro' ao descrever término de relacionamento, sem qualquer ato ou ideação física.",
    motivoDescarte:
      "Linguagem figurada em contexto de luto amoroso, avaliado com o paciente.",
  },
};
