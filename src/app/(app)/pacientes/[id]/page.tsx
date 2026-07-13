import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { carregarTimeline } from "./timeline/queries";
import { TimelineClient } from "./timeline/timeline-client";
import { Stack } from "@/components/ui/layout";
import Link from "next/link";

interface PacientePageProps {
  params: Promise<{ id: string }>;
}

export default async function PacientePage({ params }: PacientePageProps) {
  const { id } = await params;
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");

  const data = await withTenant(ctx, async (tx) => {
    // 1. Busca os dados do paciente
    const [pac] = await tx
      .select({
        id: patient.id,
        nome: patient.nome,
      })
      .from(patient)
      .where(eq(patient.id, id));

    if (!pac) return null;

    // 2. Busca a timeline
    const timeline = await carregarTimeline(ctx, id);

    return {
      paciente: pac,
      timeline,
    };
  });

  if (!data) {
    notFound();
  }

  const { paciente, timeline } = data;
  const temSnapshots = timeline && timeline.snapshots.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Stack gap="lg">
        {/* Cabeçalho do Paciente */}
        <div className="border-ink-anchor border-b-2 pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Perfil do Paciente</span>
            <h1 className="text-3xl font-black text-ink">{paciente.nome}</h1>
          </div>
          
          {/* Navegação entre abas */}
          <div className="flex border-ink-anchor border-b-2 -mb-4">
            <Link
              href={`/pacientes/${paciente.id}`}
              className="font-display -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-ink-anchor bg-gold text-ink-anchor px-6 py-2 text-base font-black"
            >
              Evolução
            </Link>
            <Link
              href={`/pacientes/${paciente.id}/briefing`}
              className="font-display -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-6 py-2 text-base font-semibold text-ink hover:text-ink-anchor hover:bg-gold/10"
            >
              Briefing
            </Link>
          </div>
        </div>

        {/* Estado Vazio ou Timeline */}
        {!temSnapshots ? (
          <div className="bg-canvas border-ink-anchor border-2 p-12 text-center my-8 max-w-2xl mx-auto">
            <div className="text-4xl mb-4">📭</div>
            <h2 className="text-2xl font-black text-ink mb-2">Sem sessões registradas</h2>
            <p className="text-sm text-muted mb-6">
              Este paciente ainda não possui sessões registradas ou snapshots de repertório materializados. 
              Assim que a primeira sessão for finalizada e consolidada, o histórico e timeline de evolução aparecerão aqui.
            </p>
            <Link
              href={`/agenda`}
              className="inline-flex items-center justify-center border-2 border-ink-anchor bg-gold px-4 py-2 text-sm font-bold text-ink-anchor hover:bg-gold/90 focus:outline-none"
            >
              Agendar Primeira Sessão &rarr;
            </Link>
          </div>
        ) : (
          <TimelineClient
            patientId={paciente.id}
            pacienteNome={paciente.nome}
            initialData={timeline}
          />
        )}
      </Stack>
    </div>
  );
}
