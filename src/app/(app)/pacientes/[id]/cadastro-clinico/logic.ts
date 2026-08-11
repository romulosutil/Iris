import "server-only";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { consent, patientClinicalProfile } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { regimeVigente } from "@/lib/consent/vigencia";

export type FichaClinicaState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
};

/**
 * Núcleo testável: grava/atualiza o perfil clínico. Só coordenador (dado
 * clínico é vedado à recepção). Bloqueia se não houver Consent LGPD prévio —
 * o cadastro administrativo tem que vir antes. Upsert por patientId (único).
 */
async function salvarFichaClinicaCore(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<FichaClinicaState> {
  requireRole(ctx, "coordenador");
  const campo = (nome: string) =>
    String(formData.get(nome) ?? "").trim() || null;

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

    await desarquivarPacienteSeArquivado(
      tx,
      ctx,
      patientId,
      "ficha_clinica",
    );

    return { ok: true };
  });
}

/**
 * Conta em somente-leitura não grava ficha clínica (#163+#159). O gate de
 * consentimento continua valendo por dentro — são barreiras independentes: uma
 * é a base legal do tratamento do dado, a outra é a relação comercial.
 */
export const salvarFichaClinica = comEscrita(salvarFichaClinicaCore);
