import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { ValidacaoFila } from "@/app/(app)/validacao/validacao-fila";

const meta = {
  title: "Pages/Validação",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

// Inline types to avoid bundling server-only / database modules in Storybook/Vite
interface LocalItemFila {
  evidenceId: string;
  patientId: string;
  patientNome: string;
  sessionNumero: number;
  trecho: string;
  classificacaoAtual: any;
  motivo: ("baixa_confianca" | "inconsistente_historico")[];
  protocolId: string | null;
  confianca: "alta" | "media" | "baixa";
  inconsistenteComHistorico: boolean;
}

const ITENS: LocalItemFila[] = [
  {
    evidenceId: "ev1",
    patientId: "p1",
    patientNome: "Gabriel Costa",
    sessionNumero: 3,
    trecho: "A criança apontou para o cartão de bola de forma independente quando mostrei o brinquedo.",
    classificacaoAtual: { alvo: { protocol_id: "vbmapp", dominio_id: "mand", tipo_estrutura: "marco_simples" } },
    motivo: ["baixa_confianca"],
    protocolId: "vbmapp",
    confianca: "baixa",
    inconsistenteComHistorico: false,
  },
  {
    evidenceId: "ev2",
    patientId: "p1",
    patientNome: "Gabriel Costa",
    sessionNumero: 4,
    trecho: "Vitor falou 'au au' ao ver o gato de pelúcia, mas o terapeuta anotou como tato independente.",
    classificacaoAtual: { alvo: { protocol_id: "vbmapp", dominio_id: "tact", tipo_estrutura: "marco_simples" } },
    motivo: ["inconsistente_historico"],
    protocolId: "vbmapp",
    confianca: "alta",
    inconsistenteComHistorico: true,
  }
];

const ALVOS: Record<string, any[]> = {
  p1: [
    { goal_id: null, protocol_id: "vbmapp", dominio_id: "mand", tipo_estrutura: "marco_simples" },
    { goal_id: null, protocol_id: "vbmapp", dominio_id: "tact", tipo_estrutura: "marco_simples" },
  ]
};

export const FilaDeValidacaoReal = {
  render: () => (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={[
          { href: "#", label: "Agenda" },
          { href: "#", label: "Pendências", badge: 2 },
          { href: "#", label: "Validação", active: true },
          { href: "#", label: "Supervisão" },
        ]}
      />
      <Container largura="md" className="py-8">
        <Stack gap="lg">
          <PageHeader
            title="Central de Validação"
            description="2 itens pedem validação do coordenador."
          />
          <ValidacaoFila itens={ITENS as any} alvosPorPaciente={ALVOS} />
        </Stack>
      </Container>
    </div>
  ),
};
