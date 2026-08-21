import type { Meta } from "@storybook/nextjs-vite";
import { Header } from "@/components/ui/header";
import { Container, Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { SupervisaoCard } from "@/components/ui/supervisao-card";
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
            <SupervisaoCard
              indice={1}
              total={2}
              patientNome="Lucas Gabriel Silva"
              patientHref="#"
              tipo="estagnacao"
              goalNome="Imitação de Gestos Simples"
              protocolNome="VB-MAPP"
              detalhe={{
                sessionNumero: 14,
                metrica: "VBMAPP",
                tipoEstrutura: "motor",
              }}
              estado="novo"
              sinalPresente={true}
              acaoPrimaria={<Button variante="primaria">Reconhecer</Button>}
              acoesSecundarias={[
                {
                  id: "resolver",
                  rotulo: "Resolver alerta…",
                  aoSelecionar: () => {},
                },
              ]}
            />

            <SupervisaoCard
              indice={2}
              total={2}
              patientNome="Beatriz Lima"
              patientHref="#"
              tipo="faltas_excessivas"
              detalhe={{
                faltas: 3,
                janelaSemanas: 2,
                limiar: 2,
              }}
              estado="reconhecido"
              sinalPresente={true}
              acaoPrimaria={<Button variante="primaria">Resolver</Button>}
              acoesSecundarias={[
                {
                  id: "descartar",
                  rotulo: "Descartar alerta…",
                  tom: "destrutivo",
                  aoSelecionar: () => {},
                },
              ]}
            />
          </Stack>
        </Stack>
      </Container>
    </div>
  ),
};
