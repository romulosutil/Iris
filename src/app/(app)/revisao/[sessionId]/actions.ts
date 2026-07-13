"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { extraction } from "@/db/schema";

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

// NOTA (decisão de produto 12/07/2026): NÃO existe aprovação em lote. A regra
// §3 ("alta confiança → lote") foi SUPERSEDIDA por um invariante mais forte de
// Camada 1: aprovar exige abrir o cartão (o botão só existe no estado expandido
// na UI). O ato de abrir é o lastro — "o conteúdo foi exibido por inteiro e a
// aprovação exigiu abri-lo". Isso dissolve a regra estatística anti-rubber-stamp
// (contador de "3 lotes seguidos") — não há lote a contar. Cada aprovação segue
// individual, com nome+timestamp (revisado_por/revisado_em) como registro.

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────
// O CORE acima recebe `ctx` (testável); estes wrappers re-derivam o tenant do
// request via getTenantContext — o cliente NUNCA fornece o contexto (não pode
// forjar clínica/papel/usuário).

export type RevisaoState = { error?: string; ok?: boolean };

async function comCtx(
  formData: FormData,
  fn: (ctx: TenantContext, extractionId: string) => Promise<ReviewResult>,
): Promise<RevisaoState> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const extractionId = String(formData.get("extractionId") ?? "");
  try {
    const r = await fn(ctx, extractionId);
    if (r.error) return { error: r.error };
    if (!r.ok) return { error: "Extração não encontrada ou já revisada." };
    if (sessionId) revalidatePath(`/revisao/${sessionId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) {
      return { error: "Só o terapeuta da sessão revisa as extrações." };
    }
    console.error("wrapper revisão:", err);
    return { error: "Não foi possível registrar a revisão." };
  }
}

export async function aprovarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  return comCtx(formData, (ctx, id) => aprovarExtracao(ctx, { extractionId: id }));
}

export async function descartarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  return comCtx(formData, (ctx, id) => descartarExtracao(ctx, { extractionId: id }));
}

export async function editarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  // payloadEditado = payload ORIGINAL (JSON no hidden) com os campos corrigidos
  // sobrepostos. Preserva o resto do conteúdo que o terapeuta não tocou; o
  // original imutável fica em `payload` (auditoria — a action core não o toca).
  let base: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("payloadOriginal") ?? "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") base = parsed as Record<string, unknown>;
  } catch {
    base = {};
  }
  const editado: Record<string, unknown> = { ...base };
  for (const campo of ["funcao", "nivel_ajuda", "resultado"] as const) {
    const v = formData.get(campo);
    if (typeof v === "string" && v.trim() !== "") editado[campo] = v.trim();
  }
  return comCtx(formData, (ctx, id) =>
    editarExtracao(ctx, { extractionId: id, payloadEditado: editado }),
  );
}
