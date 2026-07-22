import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import {
  patient,
  patientClinicalProfile,
  protocol,
  patientProtocol,
} from "@/db/schema";
import { FichaClinicaForm } from "./ficha-clinica-form";
import { ProtocolosSecao } from "./protocolos-secao";

export default async function CadastroClinicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const [pacienteRow, perfilRow, catalogo, vinculos] = await withTenant(
    ctx,
    async (tx) => [
      await tx.select().from(patient).where(eq(patient.id, id)),
      await tx
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, id)),
      await tx.select().from(protocol).where(eq(protocol.clinicId, ctx.clinicId)),
      await tx
        .select()
        .from(patientProtocol)
        .where(eq(patientProtocol.patientId, id)),
    ],
  );
  if (!pacienteRow[0]) notFound();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-[var(--text-primary)] text-3xl font-bold">
        Cadastro clínico — {pacienteRow[0].nome}
      </h1>
      <FichaClinicaForm patientId={id} perfil={perfilRow[0]} />
      <ProtocolosSecao patientId={id} catalogo={catalogo} vinculos={vinculos} />
    </div>
  );
}
