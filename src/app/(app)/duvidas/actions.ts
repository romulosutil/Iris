"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import { type TenantContext } from "@/db/rls";
import type { Alvo } from "@/lib/evidence/resolver";
import { responderQuery, type ValidacaoResult, type ValidacaoState } from "./logic";
export type { ValidacaoState };

// ─── Wrapper para `useActionState` ─────────────────────────────────────────

async function comCtx(
  fd: FormData,
  fn: (ctx: TenantContext) => Promise<ValidacaoResult>,
): Promise<ValidacaoState> {
  const ctx = await getTenantContext();
  try {
    const r = await fn(ctx);
    if (r.error) return { error: r.error };
    revalidatePath("/duvidas");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Só terapeuta da equipe ou coordenador respondem." };
    console.error("wrapper duvidas:", err);
    return { error: "Não foi possível registrar a resposta." };
  }
}

export async function responderQueryAction(
  _prev: ValidacaoState,
  fd: FormData,
): Promise<ValidacaoState> {
  const novoAlvoRaw = String(fd.get("novoAlvo") ?? "");
  return comCtx(fd, (ctx) =>
    responderQuery(ctx, {
      evidenceQueryId: String(fd.get("evidenceQueryId") ?? ""),
      respostaTexto: String(fd.get("respostaTexto") ?? ""),
      novoAlvo: novoAlvoRaw ? (JSON.parse(novoAlvoRaw) as Alvo) : undefined,
    }),
  );
}
