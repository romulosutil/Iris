import { and, asc, eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { bloqueio } from "@/db/schema";
import { type EscopoBloqueio } from "@/lib/agenda/bloqueio";

export async function listarBloqueios(
  ctx: TenantContext,
  filtro: { escopo: EscopoBloqueio; terapeutaId?: string; patientId?: string },
) {
  return withTenant(ctx, (tx) => {
    const cond = [eq(bloqueio.clinicId, ctx.clinicId), eq(bloqueio.escopo, filtro.escopo)];
    if (filtro.terapeutaId) cond.push(eq(bloqueio.terapeutaId, filtro.terapeutaId));
    if (filtro.patientId) cond.push(eq(bloqueio.patientId, filtro.patientId));
    return tx.select().from(bloqueio).where(and(...cond)).orderBy(asc(bloqueio.dataInicio));
  });
}
