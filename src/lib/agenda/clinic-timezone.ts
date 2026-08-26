import "server-only";
import { eq } from "drizzle-orm";
import { clinic } from "@/db/schema";
import { withTenant, type TenantContext } from "@/db/rls";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Fuso IANA da clínica (`clinic.timezone`), lido DENTRO de uma tx já aberta
 * por `withTenant` — não abre transação própria. Fallback ao default da
 * coluna (`schema.ts:291`) se a linha não existir (não deveria, sob RLS). */
export async function fusoDaClinica(
  tx: Tx,
  clinicId: string,
): Promise<string> {
  const [row] = await tx
    .select({ timezone: clinic.timezone })
    .from(clinic)
    .where(eq(clinic.id, clinicId));
  return row?.timezone ?? "America/Sao_Paulo";
}

/** Mesma leitura, para quem ainda não tem uma tx aberta (Server Components,
 * início de uma Server Action). Abre a própria tx via `withTenant`. */
export async function fusoDaClinicaAtual(
  ctx: TenantContext,
): Promise<string> {
  return withTenant(ctx, (tx) => fusoDaClinica(tx, ctx.clinicId));
}
