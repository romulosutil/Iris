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

  const paciente = await withTenant(ctx, async (tx) => {
    const [pac] = await tx
      .select({
        id: patient.id,
        nome: patient.nome,
      })
      .from(patient)
      .where(eq(patient.id, id));

    return pac ?? null;
  });

  if (!paciente) {
    notFound();
  }

  const timeline = await carregarTimeline(ctx, id);
  const temSnapshots = timeline && timeline.snapshots.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Stack gap="lg">
        {/* Cabeçalho do Paciente */}
        <div className="border-ink-anchor flex flex-col gap-4 border-b-2 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-muted text-xs font-bold tracking-wider uppercase">
              Perfil do Paciente
            </span>
            <h1 className="text-ink text-3xl font-black">{paciente.nome}</h1>
          </div>

          {/* Navegação entre abas */}
          <div className="border-ink-anchor -mb-4 flex border-b-2">
            <Link
              href={`/pacientes/${paciente.id}`}
              className="font-display border-ink-anchor bg-gold text-ink-anchor -mb-0.5 inline-flex min-h-11 items-center border-b-2 px-6 py-2 text-base font-black"
            >
              Evolução
            </Link>
            <Link
              href={`/pacientes/${paciente.id}/briefing`}
              className="font-display text-ink hover:text-ink-anchor hover:bg-gold/10 -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-6 py-2 text-base font-semibold"
            >
              Briefing
            </Link>
            <Link
              href={`/pacientes/${paciente.id}/ausencias`}
              className="font-display text-ink hover:text-ink-anchor hover:bg-gold/10 -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-6 py-2 text-base font-semibold"
            >
              Ausências
            </Link>
            <Link
              href={`/pacientes/${paciente.id}/horas`}
              className="font-display text-ink hover:text-ink-anchor hover:bg-gold/10 -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-6 py-2 text-base font-semibold"
            >
              Horas
            </Link>
          </div>
        </div>

        {/* Estado Vazio ou Timeline */}
        {!temSnapshots ? (
          <div className="bg-canvas border-ink-anchor mx-auto my-8 max-w-2xl border-2 p-12 text-center">
            <div className="mb-4 text-4xl">📭</div>
            <h2 className="text-ink mb-2 text-2xl font-black">
              Sem sessões registradas
            </h2>
            <p className="text-muted mb-6 text-sm">
              Este paciente ainda não possui sessões registradas ou snapshots de
              repertório materializados. Assim que a primeira sessão for
              finalizada e consolidada, o histórico e timeline de evolução
              aparecerão aqui.
            </p>
            <Link
              href={`/agenda`}
              className="border-ink-anchor bg-gold text-ink-anchor hover:bg-gold/90 inline-flex items-center justify-center border-2 px-4 py-2 text-sm font-bold focus:outline-none"
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
