import type * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CardGrid } from "./card-grid";
import { AlertaRiscoCard } from "@/components/ui/patterns/alerta-risco-card";
import { SupervisaoCard } from "./supervisao-card";
import { AppointmentCard } from "./appointment-card";
import { Button } from "./button";
import type { MenuAcaoItem } from "@/components/ui/primitives/menu-acoes";

const meta = {
  title: "04. UI COMPONENTS/Layout/CardGrid",
  component: CardGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const menu: MenuAcaoItem[] = [
  { id: "resolver", rotulo: "Resolver alerta…", aoSelecionar: () => {} },
  {
    id: "descartar",
    rotulo: "Descartar alerta…",
    tom: "destrutivo",
    aoSelecionar: () => {},
  },
];

/**
 * Alturas propositalmente desiguais: trecho curto vs. trecho longo, com e sem
 * conduta registrada. É o cenário em que o degrau entre cards apareceria se as
 * células não esticassem.
 */
const alertas = [
  {
    id: "a1",
    pacienteNome: "Lucas Gabriel Silva",
    categoria: "autolesao" as const,
    status: "aberto" as const,
    trechoFonte: "Ele disse que se machucou de novo no braço.",
    tempoRestanteFormatado: "01h 12m",
  },
  {
    id: "a2",
    pacienteNome: "Mariana Costa Ferreira",
    categoria: "ideacao_suicida" as const,
    status: "reconhecido" as const,
    trechoFonte:
      "Relatou à terapeuta que “não via sentido em continuar” e que pensou nisso mais de uma vez durante a semana, sobretudo à noite, quando fica sozinha no quarto.",
    detalhe: "Falas recorrentes em três sessões consecutivas.",
    tempoRestanteFormatado: "22m",
    reconhecidoPorNome: "Dra. Helena Prado",
  },
  {
    id: "a3",
    pacienteNome: "Pedro Henrique Alves",
    categoria: "violencia_sofrida" as const,
    status: "escalado_estagio_1" as const,
    trechoFonte: "Contou que apanhou em casa no fim de semana.",
    jaVenceu: true,
  },
  {
    id: "a4",
    pacienteNome: "Ana Beatriz Lima",
    categoria: "risco_a_terceiro" as const,
    status: "resolvido" as const,
    trechoFonte: "Ameaçou o colega durante a atividade em grupo.",
    condutaRegistrada:
      "Conversa com a família e ajuste do plano terapêutico registrado em prontuário.",
  },
  {
    id: "a5",
    pacienteNome: "Rafael Souza Martins",
    categoria: "violencia_praticada" as const,
    status: "aberto" as const,
    trechoFonte: "Bateu na irmã mais nova depois da escola.",
    tempoRestanteFormatado: "03h 40m",
  },
  {
    id: "a6",
    pacienteNome: "Júlia Fernandes Rocha",
    categoria: "autolesao" as const,
    status: "descartado" as const,
    trechoFonte: "Falou em se cortar, mas era fala de personagem do desenho.",
    ambiguo: true,
    motivoDescarte: "Contexto lúdico confirmado com a responsável.",
  },
];

const agendamentos = [
  { horario: "08:00", pacienteNome: "Lucas Gabriel Silva" },
  { horario: "09:00", pacienteNome: "Mariana Costa" },
  { horario: "10:00", pacienteNome: "Pedro Henrique Alves" },
  { horario: "11:00", pacienteNome: "Ana Beatriz Lima" },
  { horario: "13:00", pacienteNome: "Rafael Souza" },
  { horario: "14:00", pacienteNome: "Júlia Fernandes" },
  { horario: "15:00", pacienteNome: "Bruno Carvalho" },
  { horario: "16:00", pacienteNome: "Clara Monteiro" },
];

/** Alerta encerrado não oferece CTA — o card fica só com o desfecho. */
const terminal = (status: string) =>
  status === "resolvido" || status === "descartado";

function FilaDeAlertas({
  quantidade,
  cols,
}: {
  quantidade: number;
  cols?: React.ComponentProps<typeof CardGrid>["cols"];
}) {
  const itens = alertas.slice(0, quantidade);
  return (
    <CardGrid como="ul" cols={cols} aria-label="Alertas de risco em aberto">
      {itens.map((alerta) => (
        <AlertaRiscoCard
          key={alerta.id}
          como="li"
          {...alerta}
          acoesSecundarias={terminal(alerta.status) ? undefined : menu}
          acaoPrimaria={
            terminal(alerta.status) ? undefined : (
              <Button variante="primaria">Reconhecer</Button>
            )
          }
        />
      ))}
    </CardGrid>
  );
}

/** 1 card: coluna única ocupa a linha inteira — sem célula órfã vazia. */
export const UmCard: Story = {
  render: () => <FilaDeAlertas quantidade={1} />,
};

/** 2 cards no padrão `grid-cols-1 md:grid-cols-2`. */
export const DoisCards: Story = {
  render: () => <FilaDeAlertas quantidade={2} />,
};

export const QuatroCards: Story = {
  render: () => <FilaDeAlertas quantidade={4} />,
};

export const SeisCards: Story = {
  render: () => <FilaDeAlertas quantidade={6} />,
};

/** Mesma fila de 6 em 375px: empilha em coluna única, gap cai para 16px. */
export const SeisCardsMobile: Story = {
  globals: { viewport: { value: "terapeuta" } },
  render: () => <FilaDeAlertas quantidade={6} />,
};

/**
 * Três colunas a partir de `lg` em 1920px. Prova o limite superior: com 4+
 * colunas nessa largura o card de risco ficaria abaixo de ~380px e a citação
 * clínica quebraria em torres de 2 palavras.
 */
export const SeisCardsDesktopUltra: Story = {
  globals: { viewport: { value: "desktopUltra" } },
  render: () => <FilaDeAlertas quantidade={6} cols={{ md: 2, lg: 3 }} />,
};

/** Escada completa de breakpoints: 1 → 2 (sm) → 3 (lg) → 4 (xl). */
export const EscadaDeBreakpoints: Story = {
  globals: { viewport: { value: "desktopGrande" } },
  render: () => (
    <CardGrid cols={{ sm: 2, lg: 3, xl: 4 }}>
      {agendamentos.map((consulta, i) => (
        <AppointmentCard
          key={consulta.horario}
          horario={consulta.horario}
          pacienteNome={consulta.pacienteNome}
          terapeutaNome="Dra. Helena Prado"
          estado="aprovada"
          statusTexto="Confirmado"
          onAbrir={() => {}}
          onCheckIn={i % 2 === 0 ? () => {} : undefined}
        />
      ))}
    </CardGrid>
  ),
};

/**
 * Cards de supervisão com corpos de tamanhos diferentes — o CTA "Reconhecer"
 * alinha na base porque o rodapé usa `mt-auto` dentro da célula esticada.
 */
export const AlturaUniforme: Story = {
  render: () => (
    <CardGrid como="ul" cols={{ md: 2 }} aria-label="Fila de supervisão">
      <SupervisaoCard
        como="li"
        indice={1}
        total={3}
        patientNome="Lucas Gabriel Silva"
        tipo="estagnacao"
        goalNome="Imitação de Gestos Simples"
        protocolNome="VB-MAPP"
        detalhe={{
          sessionNumero: 14,
          metrica: "VBMAPP",
          tipoEstrutura: "motor",
        }}
        estado="novo"
        sinalPresente
        acoesSecundarias={menu}
        acaoPrimaria={<Button variante="primaria">Reconhecer</Button>}
      />
      <SupervisaoCard
        como="li"
        indice={2}
        total={3}
        patientNome="Mariana Costa Ferreira"
        tipo="faltas_excessivas"
        detalhe={{ faltas: 4 }}
        estado="reconhecido"
        sinalPresente={false}
        acaoPrimaria={<Button variante="primaria">Reconhecer</Button>}
      />
      <SupervisaoCard
        como="li"
        indice={3}
        total={3}
        patientNome="Pedro Henrique Alves"
        tipo="regressao"
        goalNome="Solicitação Espontânea de Itens Preferidos em Contexto Natural"
        protocolNome="ABLLS-R"
        detalhe={{
          sessionNumero: 27,
          metrica: "ABLLS",
          tipoEstrutura: "verbal",
        }}
        estado="novo"
        sinalPresente
        acoesSecundarias={menu}
        acaoPrimaria={<Button variante="primaria">Reconhecer</Button>}
      />
    </CardGrid>
  ),
};

/** Calha reduzida: filas muito densas onde 24px separam demais. */
export const GapCompacto: Story = {
  render: () => (
    <CardGrid gap="sm" cols={{ md: 2, lg: 3 }}>
      {alertas.slice(0, 6).map((alerta) => (
        <AlertaRiscoCard
          key={alerta.id}
          {...alerta}
          acaoPrimaria={
            terminal(alerta.status) ? undefined : (
              <Button variante="primaria">Reconhecer</Button>
            )
          }
        />
      ))}
    </CardGrid>
  ),
};
