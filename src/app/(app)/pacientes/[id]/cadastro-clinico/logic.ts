import "server-only";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { consent, patientClinicalProfile } from "@/db/schema";

export type FichaClinicaState = { error?: string };

/**
 * Núcleo testável: grava/atualiza o perfil clínico. Só coordenador (dado
 * clínico é vedado à recepção). Bloqueia se não houver Consent LGPD prévio —
 * o cadastro administrativo tem que vir antes. Upsert por patientId (único).
 */
export async function salvarFichaClinica(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<FichaClinicaState> {
  requireRole(ctx, "coordenador");
  const campo = (nome: string) =>
    String(formData.get(nome) ?? "").trim() || undefined;

  return withTenant(ctx, async (tx) => {
    const [consentimento] = await tx
      .select({ id: consent.id })
      .from(consent)
      .where(eq(consent.patientId, patientId))
      .limit(1);
    if (!consentimento) {
      return {
        error:
          "Este paciente ainda não tem Consentimento LGPD registrado — complete o cadastro administrativo antes do clínico.",
      };
    }

    const valores = {
      diagnostico: campo("diagnostico"),
      medicacoes: campo("medicacoes"),
      alergias: campo("alergias"),
      convulsoes: campo("convulsoes"),
      contatosEmergencia: campo("contatosEmergencia"),
    };

    // UPSERT atômico numa só ida ao banco pela chave única patientId
    // (Jules NIT — dispensa o select prévio + ramificação update/insert).
    await tx
      .insert(patientClinicalProfile)
      .values({ patientId, ...valores })
      .onConflictDoUpdate({
        target: patientClinicalProfile.patientId,
        set: valores,
      });
    return {};
  });
}
