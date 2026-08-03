import "server-only";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { consent, patientClinicalProfile } from "@/db/schema";
import { regimeVigente } from "@/lib/consent/vigencia";

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
    // Gate de consentimento: não basta EXISTIR linha em `consent` — tem de
    // haver concessão de REGIME VIGENTE (não revogada). Consentimento de
    // finalidade (`uso_ia_processamento`/`exportacao_relatorios`) NÃO serve
    // como base para tratar o paciente, e passava no `EXISTS` puro anterior.
    // O espelho em TS é para a mensagem; a fronteira real é a RLS.
    const linhas = await tx
      .select({
        id: consent.id,
        tipo: consent.tipo,
        assinadoEm: consent.assinadoEm,
        consentRevogadoId: consent.consentRevogadoId,
      })
      .from(consent)
      .where(eq(consent.patientId, patientId));
    if (linhas.length === 0) {
      return {
        error:
          "Este paciente ainda não tem Consentimento LGPD registrado — complete o cadastro administrativo antes do clínico.",
      };
    }
    if (!regimeVigente(linhas)) {
      return {
        error:
          "Este paciente não tem consentimento de tratamento vigente (nenhum registrado, ou o existente foi revogado) — registre um novo consentimento do titular, do responsável legal ou do curador antes de gravar dado clínico.",
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
