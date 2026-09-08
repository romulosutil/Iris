import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { listarBloqueios } from "@/lib/agenda/bloqueio-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AusenciasForm } from "./ausencias-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AusenciasPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador"); // ver; editar é gated na action (coordenador)
  const pac = await withTenant(ctx, async (tx) => {
    const [p] = await tx
      .select({ id: patient.id, nome: patient.nome })
      .from(patient)
      .where(and(eq(patient.id, id), eq(patient.clinicId, ctx.clinicId)))
      .limit(1);
    return p ?? null;
  });
  if (!pac) notFound();
  const bloqueios = await listarBloqueios(ctx, {
    escopo: "paciente",
    patientId: id,
  });
  return (
    <main className="flex flex-col gap-6">
      {/* Mesma casca de topo das abas irmãs do prontuário (`page.tsx`,
          `metas/page.tsx`): breadcrumb + título + descrição pelo `PageHeader`. */}
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Pacientes", href: "/pacientes" },
              { rotulo: pac.nome, href: `/pacientes/${pac.id}` },
              { rotulo: "Ausências", atual: true },
            ]}
          />
        }
        title={`Ausências · ${pac.nome}`}
        description="Períodos de indisponibilidade do paciente que bloqueiam a agenda."
      />
      <AusenciasForm patientId={id} bloqueios={bloqueios} />
    </main>
  );
}
