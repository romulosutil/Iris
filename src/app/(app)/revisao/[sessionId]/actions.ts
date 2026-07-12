"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { extraction } from "@/db/schema";
import { avaliarFriccao } from "@/lib/extraction/review-policy";

// Revisão humana das extrações sugeridas pela IA (Fase 3 Plano 2). Cada ação
// transiciona uma extração `sugerida` para um desfecho de revisão. RLS
// (extraction_update, 0006) restringe ao terapeuta dono da sessão; requireRole
// barra recepção/coordenação (quem revisa é o terapeuta que conduziu).
// A sugestão ORIGINAL da IA (payload) nunca é sobrescrita — edições vão em
// payload_editado (auditoria Camada 1). Contadores de candidatura (Fase 4)
// deliberadamente NÃO são tocados aqui (máquina dormente até a Fase 4).

const idSchema = z.object({ extractionId: z.string().uuid() });

type ReviewResult = { error?: string; ok?: boolean };

async function transicionar(
  ctx: TenantContext,
  extractionId: string,
  set: Record<string, unknown>,
): Promise<ReviewResult> {
  requireRole(ctx, "terapeuta");
  try {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(extraction)
        .set({ ...set, revisadoPor: ctx.userId, revisadoEm: new Date() })
        // só extrações ainda sugeridas são revisáveis (não pendentes/já revisadas)
        .where(and(eq(extraction.id, extractionId), eq(extraction.estado, "sugerida")))
        .returning({ id: extraction.id }),
    );
    return { ok: rows.length > 0 };
  } catch (err) {
    console.error("revisão extração:", err);
    return { error: "Não foi possível registrar a revisão." };
  }
}

export async function aprovarExtracao(
  ctx: TenantContext,
  input: { extractionId: string },
): Promise<ReviewResult> {
  const p = idSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, { estado: "aprovada" });
}

export async function descartarExtracao(
  ctx: TenantContext,
  input: { extractionId: string },
): Promise<ReviewResult> {
  const p = idSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, { estado: "descartada" });
}

const editarSchema = z.object({
  extractionId: z.string().uuid(),
  payloadEditado: z.record(z.unknown()),
});

export async function editarExtracao(
  ctx: TenantContext,
  input: { extractionId: string; payloadEditado: Record<string, unknown> },
): Promise<ReviewResult> {
  const p = editarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, {
    estado: "editada",
    payloadEditado: p.data.payloadEditado,
  });
}

const loteSchema = z.object({
  extractionIds: z.array(z.string().uuid()).min(1),
});

// Aprovação em lote — SÓ extrações elegíveis (alta confiança, sem inconsistência
// com histórico; §3). As inelegíveis são ignoradas (exigem revisão individual
// com fricção), nunca aprovadas em massa silenciosamente.
export async function aprovarLote(
  ctx: TenantContext,
  input: { extractionIds: string[] },
): Promise<{ error?: string; aprovadas?: number; ignoradas?: number }> {
  requireRole(ctx, "terapeuta");
  const p = loteSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };

  try {
    return await withTenant(ctx, async (tx) => {
      const linhas = await tx
        .select({
          id: extraction.id,
          confianca: extraction.confianca,
          inconsistente: extraction.inconsistenteComHistorico,
        })
        .from(extraction)
        .where(
          and(
            inArray(extraction.id, p.data.extractionIds),
            eq(extraction.estado, "sugerida"),
          ),
        );
      const elegiveis = linhas
        .filter((l) =>
          avaliarFriccao({
            confianca: l.confianca,
            inconsistenteComHistorico: l.inconsistente,
          }).podeLote,
        )
        .map((l) => l.id);

      if (elegiveis.length > 0) {
        await tx
          .update(extraction)
          .set({ estado: "aprovada", revisadoPor: ctx.userId, revisadoEm: new Date() })
          .where(inArray(extraction.id, elegiveis));
      }
      return {
        aprovadas: elegiveis.length,
        ignoradas: p.data.extractionIds.length - elegiveis.length,
      };
    });
  } catch (err) {
    console.error("aprovar lote:", err);
    return { error: "Não foi possível aprovar o lote." };
  }
}

export function revalidarRevisao(sessionId: string) {
  revalidatePath(`/revisao/${sessionId}`);
}
