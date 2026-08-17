import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack, Cluster } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { DataRow } from "@/components/ui/data-row";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

const meta = {
  title: "06. PAGES/Agenda",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const VisaoClinica = {
  render: () => (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={[
          { href: "#", label: "Agenda", active: true },
          { href: "#", label: "Pendências", badge: 2 },
          { href: "#", label: "Supervisão" },
        ]}
      />
      <Container largura="md" className="py-8">
        <Stack gap="lg">
          <PageHeader
            title="Agenda do dia"
            description="Terça-feira, 22 de julho de 2026"
          />

          <Stack gap="md" como="ul">
            <DataRow
              como="li"
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    08:00
                  </span>
                  <StatusBadge estado="aprovada" />
                </Cluster>
              }
              subtitle="Lucas Gabriel Silva · Dra. Mariana Souza (Fonoaudiologia)"
              trailing={
                <Button variante="secundaria" tamanho="sm">
                  Ver prontuário
                </Button>
              }
            />

            <DataRow
              como="li"
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    09:00
                  </span>
                  <StatusBadge estado="pendente" />
                </Cluster>
              }
              subtitle="Beatriz Lima · Dr. Roberto Alves (Terapia Ocupacional)"
              trailing={
                <Cluster gap="sm">
                  <Button variante="primaria" tamanho="sm">
                    Iniciar sessão
                  </Button>
                </Cluster>
              }
            />

            <DataRow
              como="li"
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    10:00
                  </span>
                  <StatusBadge estado="sugerida" />
                </Cluster>
              }
              subtitle="Gabriel Costa · Dra. Camila Nogueira (Psicologia ABA)"
              trailing={
                <Button variante="secundaria" tamanho="sm">
                  Agendar reposição
                </Button>
              }
            />
          </Stack>
        </Stack>
      </Container>
    </div>
  ),
};
