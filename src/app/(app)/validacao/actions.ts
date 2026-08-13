"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import type { Alvo } from "@/lib/evidence/resolver";
import {
  aprovarEvidenciasLote,
  confirmarEvidencia,
  invalidarEvidencia,
  reclassificarEvidencia,
  devolverComDuvida,
  type ValidacaoResult,
  type ValidacaoState,
} from "./logic";
// Re-export do tipo público consumido por `validacao-fila.tsx` (moveu p/ logic).
export type { ValidacaoState };

// ─── Wrappers para `useActionState` ────────────────────────────────────────

async function comCtx(
  fd: FormData,
  fn: (ctx: TenantContext) => Promise<ValidacaoResult>,
): Promise<ValidacaoState> {
  const ctx = await getTenantContext();
  try {
    const r = await fn(ctx);
    if (r.error) return { error: r.error };
    revalidatePath("/validacao");
    return { ok: true, aprovadas: r.aprovadas };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só o coordenador valida." };
    console.error("wrapper validação:", err);
    return { error: "Não foi possível registrar a validação." };
  }
}

export async function confirmarEvidenciaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) => confirmarEvidencia(ctx, { evidenceId: String(fd.get("evidenceId") ?? "") }));
}

export async function aprovarLoteAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  // "evidenceIds" chega como JSON string de array; parse defensivo — qualquer
  // formato inesperado vira lote inválido no zod do core (nunca aplica nada).
  let evidenceIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(fd.get("evidenceIds") ?? "[]"));
    if (Array.isArray(parsed)) evidenceIds = parsed.map(String);
  } catch {
    // deixa o array vazio → core rejeita com "Lote vazio."
  }
  return comCtx(fd, (ctx) => aprovarEvidenciasLote(ctx, { evidenceIds }));
}

export async function invalidarEvidenciaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) =>
    invalidarEvidencia(ctx, {
      evidenceId: String(fd.get("evidenceId") ?? ""),
      motivo: String(fd.get("motivo") ?? ""),
    }),
  );
}

export async function devolverComDuvidaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) =>
    devolverComDuvida(ctx, {
      evidenceId: String(fd.get("evidenceId") ?? ""),
      pergunta: String(fd.get("pergunta") ?? ""),
    }),
  );
}

export async function reclassificarEvidenciaAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  return comCtx(fd, (ctx) =>
    reclassificarEvidencia(ctx, {
      evidenceId: String(fd.get("evidenceId") ?? ""),
      justificativa: String(fd.get("justificativa") ?? ""),
      novoAlvo: JSON.parse(String(fd.get("novoAlvo") ?? "{}")) as Alvo,
    }),
  );
}
