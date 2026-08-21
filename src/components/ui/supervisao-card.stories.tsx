import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SupervisaoCard } from "./supervisao-card";
import { Button } from "@/components/ui/button";
import type { MenuAcaoItem } from "@/components/ui/primitives/menu-acoes";

const meta = {
  title: "05. PATTERNS/Supervisão/SupervisaoCard",
  component: SupervisaoCard,
  parameters: { layout: "padded" },
  argTypes: {
    tipo: {
      control: "inline-radio",
      options: ["estagnacao", "regressao", "faltas_excessivas"],
    },
    estado: {
      control: "inline-radio",
      options: ["novo", "reconhecido"],
    },
  },
} satisfies Meta<typeof SupervisaoCard>;

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

export const Estagnacao: Story = {
  args: {
    indice: 1,
    total: 3,
    patientNome: "Lucas Gabriel Silva",
    patientHref: "#",
    tipo: "estagnacao",
    goalNome: "Imitação de Gestos Simples",
    protocolNome: "VB-MAPP",
    detalhe: {
      sessionNumero: 14,
      metrica: "VBMAPP",
      tipoEstrutura: "motor",
    },
    estado: "novo",
    sinalPresente: true,
    acaoPrimaria: <Button variante="primaria">Reconhecer</Button>,
    acoesSecundarias: menuCompleto,
  },
};

export const Regressao: Story = {
  args: {
    indice: 2,
    total: 3,
    patientNome: "Ana Clara Souza",
    patientHref: "#",
    tipo: "regressao",
    goalNome: "Seguir sequência de 3 comandos motores",
    protocolNome: "Perfil Sensorial 2",
    detalhe: {
      sessionNumero: 18,
      metrica: "porcentagem",
      tipoEstrutura: "cognitivo",
    },
    estado: "novo",
    sinalPresente: true,
    acaoPrimaria: <Button variante="primaria">Reconhecer</Button>,
    acoesSecundarias: menuCompleto,
  },
};

export const FaltasExcessivas: Story = {
  args: {
    indice: 3,
    total: 3,
    patientNome: "Beatriz Lima",
    patientHref: "#",
    tipo: "faltas_excessivas",
    detalhe: {
      faltas: 3,
      janelaSemanas: 2,
      limiar: 2,
    },
    estado: "novo",
    sinalPresente: true,
    acaoPrimaria: <Button variante="primaria">Reconhecer</Button>,
    acoesSecundarias: menuSoDescarte,
  },
};

export const Reconhecido: Story = {
  args: {
    indice: 1,
    total: 2,
    patientNome: "Gabriel Martins",
    patientHref: "#",
    tipo: "estagnacao",
    goalNome: "Manutenção de Foco em Atividade Compartilhada",
    protocolNome: "DENVER",
    detalhe: {
      sessionNumero: 10,
      metrica: "tempo",
    },
    estado: "reconhecido",
    sinalPresente: true,
    acaoPrimaria: <Button variante="primaria">Resolver</Button>,
    acoesSecundarias: menuSoDescarte,
  },
};

export const SinalCessou: Story = {
  args: {
    indice: 1,
    total: 1,
    patientNome: "Sofia Ferreira",
    patientHref: "#",
    tipo: "regressao",
    goalNome: "Contato Visual com Terapeuta",
    protocolNome: "ABLLS-R",
    detalhe: {
      sessionNumero: 8,
    },
    estado: "reconhecido",
    sinalPresente: false,
    acaoPrimaria: <Button variante="primaria">Resolver</Button>,
  },
};

export const DadosNulosOuParciais: Story = {
  args: {
    indice: 1,
    total: 1,
    patientNome: "Thiago Rocha",
    patientHref: "#",
    tipo: "estagnacao",
    goalNome: "Nomeação de Objetos do Cotidiano",
    protocolNome: null,
    detalhe: {
      sessionNumero: null,
      metrica: null,
    },
    estado: "novo",
    sinalPresente: true,
    acaoPrimaria: <Button variante="primaria">Reconhecer</Button>,
    acoesSecundarias: menuCompleto,
  },
};
