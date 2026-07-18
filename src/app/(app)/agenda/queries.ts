import { and, asc, eq, ilike } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";

export async function listarPacientes(
  ctx: TenantContext,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: schema.patient.id, nome: schema.patient.nome })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.clinicId, ctx.clinicId),
          ilike(schema.patient.nome, `%${termo}%`),
        ),
      )
      .orderBy(asc(schema.patient.nome))
      .limit(20),
  );
}
