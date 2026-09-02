import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack, Cluster } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { DataRow } from "@/components/ui/data-row";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewClinicalIllustration } from "@/components/ui/illustrations";
import { MicroConquistaBadge } from "@/components/ui/micro-conquista-badge";

const meta = {
  title: "06. PAGES/Pendências",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const FilaDePendencias = {
  render: () => (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={[
          { href: "#", label: "Agenda" },
          { href: "#", label: "Pendências", badge: 2, active: true },
          { href: "#", label: "Supervisão" },
        ]}
      />
      <Container largura="md" className="py-8">
        <Stack gap="lg">
          <PageHeader title="Pendências" description="2 itens pedem atenção." />

          <Stack gap="md" como="ul">
            <DataRow
              como="li"
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    Sessão de 21/07 · 14:00
                  </span>
                  <StatusBadge estado="sugerida" />
                </Cluster>
              }
              subtitle="Lucas Gabriel Silva · Dra. Mariana Souza — Captação rápida de áudio aguardando consolidação"
              trailing={
                <Button variante="primaria" tamanho="sm">
                  Consolidar sessão
                </Button>
              }
            />

            <DataRow
              como="li"
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    Sessão de 20/07 · 10:30
                  </span>
                  <StatusBadge estado="pendente" />
                </Cluster>
              }
              subtitle="Beatriz Lima · Dr. Roberto Alves — Extração pendente de reprocessamento (falha de pipeline)"
              trailing={
                <Button variante="secundaria" tamanho="sm">
                  Reprocessar
                </Button>
              }
            />
          </Stack>
        </Stack>
      </Container>
    </div>
  ),
};

export const FilaDePendenciasVazia = {
  render: () => (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={[
          { href: "#", label: "Agenda" },
          { href: "#", label: "Pendências", active: true },
          { href: "#", label: "Supervisão" },
        ]}
      />
      <Container largura="md" className="py-8">
        <Stack gap="lg">
          <PageHeader title="Pendências Gerais" />
          <EmptyState
            illustration={<ReviewClinicalIllustration size={100} />}
            badge={
              <MicroConquistaBadge icon="check" animated={false}>
                Tudo em dia
              </MicroConquistaBadge>
            }
            title="Dia limpo"
            description="Nenhuma pendência operacional pendente."
            variant="celebration"
          />
        </Stack>
      </Container>
    </div>
  ),
};
