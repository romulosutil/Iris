"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { type TenantContext } from "@/db/rls";
import {
  aprovarExtracao,
  descartarExtracao,
  editarExtracao,
  type ReviewResult,
} from "./logic";

// ─── Wrappers para `useActionState` (resolvem o tenant do request) ────────────
// O CORE acima recebe `ctx` (testável); estes wrappers re-derivam o tenant do
// request via getTenantContext — o cliente NUNCA fornece o contexto (não pode
// forjar clínica/papel/usuário).

export type RevisaoState = { error?: string; ok?: boolean };

async function comCtx(
  formData: FormData,
  fn: (
    ctx: TenantContext,
    extractionId: string,
    versao: number,
    justificativaColapso: string | undefined,
  ) => Promise<ReviewResult>,
): Promise<RevisaoState> {
  const ctx = await getTenantContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const extractionId = String(formData.get("extractionId") ?? "");
  const versao = Number(formData.get("versao") ?? "1");
  // T07 (R-10/R-11): campo opcional só usado quando `podeAutoValidar` colapsa
  // a aprovação e a extração é de fricção alta — a UI (`revisao-lista.tsx`)
  // só renderiza o textarea nesse caso. Ausente nos demais fluxos.
  const justificativaColapsoRaw = formData.get("justificativaColapso");
  const justificativaColapso =
    typeof justificativaColapsoRaw === "string" &&
    justificativaColapsoRaw.trim()
      ? justificativaColapsoRaw
      : undefined;
  try {
    const r = await fn(ctx, extractionId, versao, justificativaColapso);
    if (r.error) {
      if (r.error === "CONCURRENCY_ERROR") {
        return { error: "CONCURRENCY_ERROR" };
      }
      return { error: r.error };
    }
    if (!r.ok) return { error: "Extração não encontrada ou já revisada." };
    if (sessionId) {
      revalidatePath(`/revisao/${sessionId}`);
      revalidatePath(`/sessoes/${sessionId}`);
    }
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
  return comCtx(formData, (ctx, id, versao, justificativaColapso) =>
    aprovarExtracao(ctx, { extractionId: id, versao, justificativaColapso }),
  );
}

export async function descartarExtracaoAction(
  _prev: RevisaoState,
  formData: FormData,
): Promise<RevisaoState> {
  // descartar não usa justificativaColapso — não insere evidence/evidence_revision.
  return comCtx(formData, (ctx, id, versao) =>
    descartarExtracao(ctx, { extractionId: id, versao }),
  );
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
    if (parsed && typeof parsed === "object")
      base = parsed as Record<string, unknown>;
  } catch {
    base = {};
  }
  const editado: Record<string, unknown> = { ...base };
  for (const campo of ["funcao", "nivel_ajuda", "resultado"] as const) {
    const v = formData.get(campo);
    if (typeof v === "string" && v.trim() !== "") editado[campo] = v.trim();
  }
  return comCtx(formData, (ctx, id, versao, justificativaColapso) =>
    editarExtracao(ctx, {
      extractionId: id,
      payloadEditado: editado,
      versao,
      justificativaColapso,
    }),
  );
}
