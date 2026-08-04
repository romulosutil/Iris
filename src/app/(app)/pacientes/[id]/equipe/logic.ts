import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { careTeamMembership } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";

type EquipeState = { error?: string; bloqueioConta?: BloqueioConta };

// Espelha o CHECK ctm_papel do banco. Validação de app dá erro amigável antes
// de o CHECK do Postgres estourar.
const PAPEIS_EQUIPE = [
  "terapeuta_referencia",
  "coordenador_referencia",
  "substituto",
] as const;

/** Núcleo testável — recebe ctx (nunca do request). */
async function adicionarMembroEquipeCore(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<EquipeState> {
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

/**
 * Conta em somente-leitura não monta nem desmonta equipe (#163+#159): montar
 * equipe é o que dá acesso ao prontuário pela RLS, então seria concessão de
 * acesso novo numa conta sem relação comercial vigente.
 */
export const adicionarMembroEquipe = comEscrita(adicionarMembroEquipeCore);

/** Encerra o vínculo append-only: marca `vigenciaFim`, nunca deleta (histórico). */
async function encerrarVinculoEquipeCore(
  ctx: TenantContext,
  membershipId: string,
): Promise<EquipeState> {
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

export const encerrarVinculoEquipe = comEscrita(encerrarVinculoEquipeCore);
