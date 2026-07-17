import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { listarBloqueios } from "@/app/(app)/agenda/bloqueio-queries";
import { AusenciasForm } from "./ausencias-form";

interface Props { params: Promise<{ id: string }>; }

export default async function AusenciasPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador"); // ver; editar é gated na action (coordenador)
  const pac = await withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ id: patient.id, nome: patient.nome })
      .from(patient).where(and(eq(patient.id, id), eq(patient.clinicId, ctx.clinicId))).limit(1);
    return p ?? null;
  });
  if (!pac) notFound();
  const bloqueios = await listarBloqueios(ctx, { escopo: "paciente", patientId: id });
  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-ink-anchor text-2xl font-black">Ausências — {pac.nome}</h1>
      <AusenciasForm patientId={id} bloqueios={bloqueios} />
    </main>
  );
}
