import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack, Cluster } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";

const meta = {
  title: "06. PAGES/Supervisão",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const FilaDeSupervisao = {
  render: () => (
    <div className="min-h-dvh bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        itemsNav={[
          { href: "#", label: "Agenda" },
          { href: "#", label: "Pendências", badge: 2 },
          { href: "#", label: "Supervisão", active: true },
        ]}
      />
      <Container largura="md" className="py-8">
        <Stack gap="lg">
          <PageHeader
            title="Supervisão Clínica"
            description="Acompanhamento de estagnação, regressão clínica e faltas excessivas."
          />

          <Stack gap="md" como="ul">
            <li className="bg-[var(--surface-card)] p-5 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]">
              <Stack gap="sm">
                <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold tracking-wide uppercase">
                  Item 1 de 2
                </span>
                <h3 className="text-[var(--text-primary)] text-lg font-semibold font-display">
                  Lucas Gabriel Silva
                </h3>
                <p className="text-[var(--text-primary)] text-base">
                  Imitação de Gestos Simples — Protocolo ABA: Estagnação (métrica VBMAPP, sessão 14)
                </p>
                <ChipGroup rotulo="Status e Tipo do Alerta">
                  <Chip>Estagnação</Chip>
                  <Chip className="border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]">
                    Alerta Crítico
                  </Chip>
                </ChipGroup>
                <Cluster gap="sm" className="pt-2">
                  <Button variante="primaria" tamanho="sm">
                    Reconhecer
                  </Button>
                  <Button variante="secundaria" tamanho="sm">
                    Resolver
                  </Button>
                </Cluster>
              </Stack>
            </li>

            <li className="bg-[var(--surface-card)] p-5 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]">
              <Stack gap="sm">
                <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold tracking-wide uppercase">
                  Item 2 de 2
                </span>
                <h3 className="text-[var(--text-primary)] text-lg font-semibold font-display">
                  Beatriz Lima
                </h3>
                <p className="text-[var(--text-primary)] text-base">
                  3 faltas seguidas do paciente nas últimas 2 semanas (limiar 2)
                </p>
                <ChipGroup rotulo="Status e Tipo do Alerta">
                  <Chip>Faltas Excessivas</Chip>
                </ChipGroup>
                <Cluster gap="sm" className="pt-2">
                  <Button variante="secundaria" tamanho="sm">
                    Resolver
                  </Button>
                  <Button variante="neutra" tamanho="sm">
                    Descartar
                  </Button>
                </Cluster>
              </Stack>
            </li>
          </Stack>
        </Stack>
      </Container>
    </div>
  ),
};
