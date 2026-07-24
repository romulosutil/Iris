"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import type { Alvo } from "@/lib/evidence/resolver";
import {
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
    return { ok: true };
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
