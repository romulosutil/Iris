"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { careTeamMembership } from "@/db/schema";

// Espelha o CHECK ctm_papel do banco. Validação de app dá erro amigável antes
// de o CHECK do Postgres estourar.
const PAPEIS_EQUIPE = [
  "terapeuta_referencia",
  "coordenador_referencia",
  "substituto",
] as const;

export async function adicionarMembroEquipe(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Selecione um terapeuta." };
  const disciplina = String(formData.get("disciplina") ?? "").trim();
  if (!disciplina) return { error: "Informe a disciplina." };
  const papelNaEquipe = String(formData.get("papelNaEquipe") ?? "").trim();
  if (
    !PAPEIS_EQUIPE.includes(papelNaEquipe as (typeof PAPEIS_EQUIPE)[number])
  ) {
    return { error: "Papel na equipe inválido." };
  }
  const responsavelTecnicoId =
    String(formData.get("responsavelTecnicoId") ?? "").trim() || undefined;
  // Espelha o CHECK ctm_nao_auto_supervisao.
  if (responsavelTecnicoId && responsavelTecnicoId === userId) {
    return {
      error: "Um terapeuta não pode ser responsável técnico de si mesmo.",
    };
  }
  await withTenant(ctx, (tx) =>
    tx.insert(careTeamMembership).values({
      patientId,
      userId,
      disciplina,
      papelNaEquipe,
      responsavelTecnicoId,
    }),
  );
  return {};
}

/** Encerra o vínculo append-only: marca `vigenciaFim`, nunca deleta (histórico). */
export async function encerrarVinculoEquipe(
  ctx: TenantContext,
  membershipId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, (tx) =>
    tx
      .update(careTeamMembership)
      // Data no fuso do Brasil, resolvida pelo Postgres — evita off-by-one por
      // UTC em encerramentos feitos à noite (UTC-3) (Jules WARN).
      .set({ vigenciaFim: sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date` })
      .where(eq(careTeamMembership.id, membershipId)),
  );
  return {};
}

export async function adicionarMembroEquipeAction(
  patientId: string,
  _prev: { error?: string },
  formData: FormData,
) {
  const resultado = await adicionarMembroEquipe(
    await getTenantContext(),
    patientId,
    formData,
  );
  if (!resultado.error) revalidatePath(`/pacientes/${patientId}/equipe`);
  return resultado;
}

// Usada como `action` de <form> nativo → retorna void e revalida a rota da equipe.
export async function encerrarVinculoAction(
  membershipId: string,
): Promise<void> {
  await encerrarVinculoEquipe(await getTenantContext(), membershipId);
  revalidatePath("/pacientes/[id]/equipe", "page");
}
