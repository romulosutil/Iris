import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

export async function obterDadosTrialDaClinica(ctx: TenantContext): Promise<{
  trialComecoEm: Date | null;
  trialDias: number | null;
  timezone: string;
}> {
  return withTenant(ctx, async (tx) => {
    // Query direta do clinic para obter dados de trial e timezone.
    // RLS aplica-se automaticamente via withTenant.
    const result = (await tx.execute(sql`
      SELECT trial_comeco_em, trial_dias, timezone FROM clinic WHERE id = ${ctx.clinicId} LIMIT 1
    `)) as unknown as Array<{
      trial_comeco_em: string | null;
      trial_dias: number | null;
      timezone: string;
    }>;

    const row = result[0];
    return {
      trialComecoEm: row?.trial_comeco_em ? new Date(row.trial_comeco_em) : null,
      trialDias: row?.trial_dias ?? null,
      timezone: row?.timezone ?? "America/Sao_Paulo",
    };
  });
}
