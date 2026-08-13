import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PatientProgressIllustration } from "@/components/ui/illustrations";
import { PageHeader } from "@/components/ui/page-header";
import {
  ProtocolProgressBarChart,
  ProtocolTrendChart,
} from "@/components/ui/protocol-dashboard-charts";
import { getProtocolDashboardMetrics } from "./queries";

export const metadata = { title: "Protocolos · Iris" };

/**
 * Dashboard de progresso por protocolo (issue #250): uma barra por protocolo
 * ativo (sólido = dominadas; hachura = candidatas IA pendentes de validação)
 * + trajetória cumulativa de evidências por sessão.
 */
export default async function ProtocolosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    // Recepção não vê dados clínicos (RLS + fronteira de papel).
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }

  const dados = await getProtocolDashboardMetrics(ctx, id);
  if (!dados) notFound();

  const semDados = dados.protocolos.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: dados.paciente.nome, href: `/pacientes/${id}` },
              { rotulo: "Protocolos", atual: true },
            ]}
          />
        }
        title={`Protocolos · ${dados.paciente.nome}`}
        description="Progresso por protocolo ativo: metas dominadas (sólido) e candidatas sugeridas pela IA (hachura), pendentes de validação do coordenador."
      />

      {semDados ? (
        <EmptyState
          illustration={<PatientProgressIllustration />}
          title="Nenhum protocolo ativo por aqui ainda"
          description="Vincule o primeiro protocolo no cadastro clínico do paciente para acompanhar o progresso das metas por aqui."
          action={
            <Button asChild>
              <Link href={`/pacientes/${id}/cadastro-clinico`}>
                Ir para o cadastro clínico
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="Progresso por protocolo" className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold text-text-primary">
              Progresso por protocolo
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {dados.protocolos.map((p) => (
                <ProtocolProgressBarChart key={p.protocoloNome} data={p} />
              ))}
            </div>
          </section>

          <section aria-label="Trajetória de evolução" className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold text-text-primary">
              Trajetória de evolução
            </h2>
            <ProtocolTrendChart
              pontos={dados.tendencia}
              titulo="Evidências acumuladas por sessão"
              protocoloNome={dados.paciente.nome}
            />
          </section>
        </>
      )}
    </div>
  );
}
