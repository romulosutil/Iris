"use server";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
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

    const [existente] = await tx
      .select({ id: patientClinicalProfile.id })
      .from(patientClinicalProfile)
      .where(eq(patientClinicalProfile.patientId, patientId))
      .limit(1);

    const valores = {
      diagnostico: campo("diagnostico"),
      medicacoes: campo("medicacoes"),
      alergias: campo("alergias"),
      convulsoes: campo("convulsoes"),
      contatosEmergencia: campo("contatosEmergencia"),
    };

    if (existente) {
      await tx
        .update(patientClinicalProfile)
        .set(valores)
        .where(eq(patientClinicalProfile.patientId, patientId));
    } else {
      await tx.insert(patientClinicalProfile).values({ patientId, ...valores });
    }
    return {};
  });
}

/** Wrapper para `useActionState` (patientId via bind). */
export async function salvarFichaClinicaAction(
  patientId: string,
  _prev: FichaClinicaState,
  formData: FormData,
): Promise<FichaClinicaState> {
  const ctx = await getTenantContext();
  return salvarFichaClinica(ctx, patientId, formData);
}
