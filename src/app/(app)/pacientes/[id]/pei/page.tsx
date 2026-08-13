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
import { getProtocolDashboardMetrics } from "../protocolos/queries";

export const metadata = { title: "Visão do PEI · Iris" };

/**
 * Visão comparativa do PEI (issue #250): uma barra por disciplina presente
 * nas metas (ABA/Fono/TO) + trajetória cumulativa de evidências. A GESTÃO das
 * metas (criar, dominar, pausar) fica em /pacientes/[id]/metas.
 */
export default async function PeiPage({
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

  const semDados = dados.porDisciplina.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: dados.paciente.nome, href: `/pacientes/${id}` },
              { rotulo: "Visão do PEI", atual: true },
            ]}
          />
        }
        title={`Visão do PEI · ${dados.paciente.nome}`}
        description="Comparativo de progresso por disciplina. Para criar ou revisar metas, use a página de Metas do paciente."
      />

      {semDados ? (
        <EmptyState
          illustration={<PatientProgressIllustration />}
          title="O PEI deste paciente ainda não tem metas"
          description="Vincule um protocolo no cadastro clínico e crie as primeiras metas para acompanhar o comparativo por disciplina."
          action={
            <Button asChild>
              <Link href={`/pacientes/${id}/cadastro-clinico`}>
                Ir para o cadastro clínico
              </Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variante="neutra">
              <Link href={`/pacientes/${id}/metas`}>Gerenciar metas</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="Progresso por disciplina" className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold text-text-primary">
              Progresso por disciplina
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {dados.porDisciplina.map((d) => (
                <ProtocolProgressBarChart key={d.protocoloNome} data={d} />
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
