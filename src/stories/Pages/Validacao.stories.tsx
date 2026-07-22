import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack, Cluster } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Pages/Validação",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const FilaDeValidacao = {
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
            title="Fila de validação"
            description="1 item pede validação do coordenador."
          />

          <Stack gap="md" como="ul">
            <li className="bg-[var(--surface-card)] p-5 border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]">
              <Stack gap="sm">
                <Cluster gap="sm" className="items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    Gabriel Costa — Imita gesto simples
                  </h3>
                  <StatusBadge estado="devolvida" />
                </Cluster>
                <p className="text-[var(--text-primary)] text-sm">
                  Terapeuta sugeriu nova marcação de marco clínico. Requer aprovação do coordenador de área.
                </p>
                <Cluster gap="sm" className="pt-2">
                  <Button variante="primaria" tamanho="sm">
                    Confirmar
                  </Button>
                  <Button variante="secundaria" tamanho="sm">
                    Reclassificar
                  </Button>
                  <Button variante="neutra" tamanho="sm">
                    Devolver dúvida
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
