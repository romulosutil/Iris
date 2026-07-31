import "server-only";
import { eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic } from "@/db/schema";

export async function obterDadosTrialDaClinica(ctx: TenantContext): Promise<{
  trialComecoEm: Date | null;
  trialDias: number | null;
  timezone: string;
}> {
  return withTenant(ctx, async (tx) => {
    // Query direta do clinic para obter dados de trial e timezone.
    // RLS aplica-se automaticamente via withTenant (set_config já feito por
    // withTenant nesta mesma transação `tx`).
    //
    // Finding 3 da review da PR #166: antes usava `sql` bruto com
    // `as unknown as Array<...>`, escapando da tipagem do Drizzle. A
    // migração 0057 já declara essas colunas em src/db/schema.ts (commit
    // 0a5116b), então a API builder expressa a mesma query 1:1 — sem
    // set_config/CTE/definer nesse trecho, então não há nada perdido na
    // troca.
    const [row] = await tx
      .select({
        trialComecoEm: clinic.trialComecoEm,
        trialDias: clinic.trialDias,
        timezone: clinic.timezone,
      })
      .from(clinic)
      .where(eq(clinic.id, ctx.clinicId))
      .limit(1);

    return {
      trialComecoEm: row?.trialComecoEm ?? null,
      trialDias: row?.trialDias ?? null,
      timezone: row?.timezone ?? "America/Sao_Paulo",
    };
  });
}
