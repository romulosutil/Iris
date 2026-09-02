import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stack, Cluster, Split, Grid, Container } from "./layout";
import { StatusBadge } from "./patterns/status-badge";
import { Chip } from "./chip";
import { Button } from "./button";
import { Header } from "./header";
import { PageHeader } from "./page-header";
import { Banner } from "./banner";

const meta = {
  title: "04. UI COMPONENTS/Layout/Layout",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StackVertical: Story = {
  render: () => (
    <Stack gap="md" className="max-w-md">
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Diário
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Evidências
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3">
        Protocolo
      </div>
    </Stack>
  ),
};

export const ClusterDeChips: Story = {
  render: () => (
    <Cluster gap="sm">
      <Chip>ABA</Chip>
      <Chip>Fonoaudiologia</Chip>
      <Chip>Terapia Ocupacional</Chip>
      <Chip>Psicologia</Chip>
    </Cluster>
  ),
};

export const GridResponsivo: Story = {
  render: () => (
    <Grid colunas={3} gap="md">
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 1
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 2
      </div>
      <div className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        Métrica 3
      </div>
    </Grid>
  ),
};

const larguraDemo = [
  {
    largura: "sm" as const,
    rotulo: "sm — 48rem fixo (coluna de leitura: auth, cadastro)",
  },
  {
    largura: "md" as const,
    rotulo: "md — 64rem, sobe para 80rem a partir de lg (shell do app)",
  },
  {
    largura: "lg" as const,
    rotulo: "lg — 80rem, sobe para 96rem a partir de xl (painéis largos)",
  },
  { largura: "full" as const, rotulo: "full — sem teto, só o padding fluido" },
];

function DemoLarguras() {
  return (
    <Stack gap="md" className="py-4">
      {larguraDemo.map(({ largura, rotulo }) => (
        <Container
          key={largura}
          largura={largura}
          className="font-body border-2 border-dashed border-[var(--border-brutal)] py-4 text-center text-sm text-[var(--text-primary)]"
        >
          {rotulo}
        </Container>
      ))}
    </Stack>
  );
}

export const ContainerLarguras: Story = {
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "As quatro variantes lado a lado. Troque o viewport para ver `md` e `lg` crescerem nos breakpoints `lg` e `xl` — o padding lateral acompanha em `px-4 sm:px-6 lg:px-8`.",
      },
    },
  },
  render: () => <DemoLarguras />,
};

export const ContainerDesktopGrande: Story = {
  globals: { viewport: { value: "desktopGrande" } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "1440px: `md` já rendeu 80rem (1280px) e `lg` chegou a 1280px, ambos com 32px de recuo lateral.",
      },
    },
  },
  render: () => <DemoLarguras />,
};

export const ContainerDesktopUltra: Story = {
  globals: { viewport: { value: "desktopUltra" } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "1920px: `lg` abre para 96rem (1536px). É aqui que o teto fixo antigo de 1024px deixava ~450px de vazio de cada lado.",
      },
    },
  },
  render: () => <DemoLarguras />,
};

const itemsNavExemplo = [
  { href: "#validacao", label: "Central de Validação", badge: 3, active: true },
  { href: "#agenda", label: "Agenda" },
  { href: "#pacientes", label: "Pacientes" },
  { href: "#equipe", label: "Equipe" },
];

function ShellCompleto() {
  return (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={itemsNavExemplo}
        largura="md"
        onSignOut={() => {}}
      />
      <Container largura="md" className="pt-4">
        <Banner variant="alerta" titulo="Alerta de risco sem reconhecimento">
          <p>
            Há 2 alertas de risco desta clínica sem reconhecimento além do
            segundo prazo de escalonamento interno.
          </p>
        </Banner>
      </Container>
      <Container como="main" largura="md" className="flex-1 py-6 sm:py-10">
        <PageHeader
          title="Central de Validação"
          description="A IA anotou 3 sugestões de sessões. Pronto para validar com seu olhar clínico?"
          actions={
            <Button variante="primaria" tamanho="sm">
              Validar em lote
            </Button>
          }
        />
        <Grid colunas={3} gap="md">
          {["Sessão 12/08", "Sessão 13/08", "Sessão 14/08"].map((t) => (
            <div
              key={t}
              className="font-body rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]"
            >
              {t}
            </div>
          ))}
        </Grid>
      </Container>
    </div>
  );
}

export const ShellDesktopGrande: Story = {
  globals: { viewport: { value: "desktopGrande" } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          '1440px. Marca do header, banner e PageHeader nascem todos na mesma coluna: o fundo do header sangra de ponta a ponta, mas seu conteúdo interno usa o mesmo `Container largura="md"` do shell.',
      },
    },
  },
  render: () => <ShellCompleto />,
};

export const ShellDesktopUltra: Story = {
  globals: { viewport: { value: "desktopUltra" } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "1920px. Mesmo alinhamento com gutter de 320px. Banner herda a largura do container pai — não carrega teto próprio, então acompanha a expansão sem ajuste.",
      },
    },
  },
  render: () => <ShellCompleto />,
};

export const SplitTituloEstado: Story = {
  render: () => (
    <Split className="max-w-lg rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        Imita gesto simples
      </h3>
      <StatusBadge estado="sugerida" />
    </Split>
  ),
};
