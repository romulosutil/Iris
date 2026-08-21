import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { anamnese, anamneseAlvo } from "@/db/schema";

/**
 * #407 T18 — Resolve a anamnese vigente de um paciente (ANAM-20 / ANAM-12).
 *
 * A vigente é a validada mais recente por `validada_em DESC, id DESC`.
 * `criado_em` NUNCA entra no desempate da vigente (espelha `idx_anamnese_vigente`).
 */
export async function obterAnamneseVigente(
  ctx: TenantContext,
  patientId: string,
) {
  return await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(anamnese)
      .where(
        and(eq(anamnese.patientId, patientId), eq(anamnese.estado, "validada")),
      )
      .orderBy(desc(anamnese.validadaEm), desc(anamnese.id))
      .limit(1);

    if (!row) return null;

    const alvos = await tx
      .select()
      .from(anamneseAlvo)
      .where(eq(anamneseAlvo.anamneseId, row.id))
      .orderBy(anamneseAlvo.criadoEm);

    return {
      ...row,
      alvos,
    };
  });
}
