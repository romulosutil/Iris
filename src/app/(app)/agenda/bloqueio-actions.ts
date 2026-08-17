"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError, requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { bloqueio } from "@/db/schema";
import { validarBloqueio } from "@/lib/agenda/bloqueio";

export type BloqueioState = { error?: string; ok?: boolean };

export async function criarBloqueioAction(
  _prev: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const ctx = await getTenantContext();
  const validado = validarBloqueio({
    escopo: formData.get("escopo")?.toString(),
    terapeutaId: formData.get("terapeutaId")?.toString(),
    patientId: formData.get("patientId")?.toString(),
    dataInicio: formData.get("dataInicio")?.toString(),
    dataFim: formData.get("dataFim")?.toString(),
    motivo: formData.get("motivo")?.toString(),
  });
  if (!validado.ok) return { error: validado.error };
  try {
    requireRole(ctx, "coordenador");
    await withTenant(ctx, (tx) =>
      tx.insert(bloqueio).values({ clinicId: ctx.clinicId, ...validado.valor }),
    );
    const caminho = formData.get("caminho")?.toString();
    if (caminho) revalidatePath(caminho);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Você não tem permissão para registrar bloqueios." };
    console.error("criarBloqueioAction:", err);
    return { error: "Não foi possível registrar o bloqueio. Tente novamente." };
  }
}

export async function removerBloqueioAction(
  _prev: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const ctx = await getTenantContext();
  const id = formData.get("id")?.toString() ?? "";
  try {
    requireRole(ctx, "coordenador");
    await withTenant(ctx, (tx) =>
      tx
        .delete(bloqueio)
        .where(and(eq(bloqueio.clinicId, ctx.clinicId), eq(bloqueio.id, id))),
    );
    const caminho = formData.get("caminho")?.toString();
    if (caminho) revalidatePath(caminho);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Você não tem permissão para remover bloqueios." };
    console.error("removerBloqueioAction:", err);
    return { error: "Não foi possível remover. Tente novamente." };
  }
}
