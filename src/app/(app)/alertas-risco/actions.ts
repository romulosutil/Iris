"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import {
  descartarAlertaRisco,
  reconhecerAlertaRisco,
  resolverAlertaRisco,
  type RiscoResult,
} from "./logic";

/**
 * #122 — só WRAPPERS aqui. O core ctx-accepting vive em `logic.ts`
 * (`server-only`): exportar função que aceita `ctx` de um módulo `"use server"`
 * a transforma em endpoint invocável pelo cliente com ctx forjado, o que é
 * bypass de RLS cross-tenant (#55). O guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type RiscoState = { ok?: true; error?: string };

async function comCtx(
  fn: (ctx: TenantContext) => Promise<RiscoResult>,
): Promise<RiscoState> {
  try {
    const ctx = await getTenantContext();
    const r = await fn(ctx);
    if ("ok" in r) {
      revalidatePath("/alertas-risco");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    console.error("wrapper alertas-risco:", err);
    return { error: "Erro interno no servidor." };
  }
}

export async function reconhecerAction(
  _prev: RiscoState,
  fd: FormData,
): Promise<RiscoState> {
  const alertaId = String(fd.get("alertaId") ?? "");
  return comCtx((ctx) => reconhecerAlertaRisco(ctx, { alertaId }));
}

export async function resolverAction(
  _prev: RiscoState,
  fd: FormData,
): Promise<RiscoState> {
  const alertaId = String(fd.get("alertaId") ?? "");
  const conduta = String(fd.get("conduta") ?? "");
  return comCtx((ctx) => resolverAlertaRisco(ctx, { alertaId, conduta }));
}

export async function descartarAction(
  _prev: RiscoState,
  fd: FormData,
): Promise<RiscoState> {
  const alertaId = String(fd.get("alertaId") ?? "");
  const motivo = String(fd.get("motivo") ?? "");
  return comCtx((ctx) => descartarAlertaRisco(ctx, { alertaId, motivo }));
}
