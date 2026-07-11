"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { patientProtocol } from "@/db/schema";

/**
 * Ativa um protocolo de referência para o paciente. Só coordenador. Vínculo é
 * append-only: desativar nunca deleta, só marca `desativadoEm` (histórico).
 */
export async function ativarProtocolo(
  ctx: TenantContext,
  patientId: string,
  protocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  if (!protocolId) return { error: "Selecione um protocolo." };
  await withTenant(ctx, (tx) =>
    tx
      .insert(patientProtocol)
      .values({ patientId, protocolId, ativadoPor: ctx.userId }),
  );
  return {};
}

export async function desativarProtocolo(
  ctx: TenantContext,
  patientProtocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, (tx) =>
    tx
      .update(patientProtocol)
      .set({ desativadoEm: new Date().toISOString().slice(0, 10) })
      .where(eq(patientProtocol.id, patientProtocolId)),
  );
  return {};
}

// Usadas como `action` de <form> nativo (fire-and-refresh) → retornam void e
// revalidam a rota do cadastro clínico para refletir o novo estado do vínculo.
export async function ativarProtocoloAction(
  patientId: string,
  protocolId: string,
): Promise<void> {
  await ativarProtocolo(await getTenantContext(), patientId, protocolId);
  revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
}

export async function desativarProtocoloAction(
  patientProtocolId: string,
): Promise<void> {
  await desativarProtocolo(await getTenantContext(), patientProtocolId);
  revalidatePath("/pacientes/[id]/cadastro-clinico", "page");
}
