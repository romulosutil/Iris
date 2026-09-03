"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { salvarConfigEmergencia } from "./logic";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { textoErroInterno } from "@/lib/copy/erros";

/**
 * #122 Fatia 4 — só WRAPPERS aqui. O core ctx-accepting vive em `logic.ts`
 * (`server-only`): exportar função que aceita `ctx` de um módulo `"use server"`
 * a transforma em endpoint invocável pelo cliente com ctx forjado, o que é
 * bypass de RLS cross-tenant (#55). O guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type EmergenciaState = { ok?: true; error?: string };

export async function salvarEmergenciaAction(
  _prev: EmergenciaState,
  fd: FormData,
): Promise<EmergenciaState> {
  try {
    const ctx = await getTenantContext();
    requireRole(ctx, "coordenador");

    const r = await salvarConfigEmergencia(ctx, {
      responsavelTecnicoId: String(fd.get("responsavelTecnicoId") ?? ""),
      protocoloInterno: String(fd.get("protocoloInterno") ?? ""),
      declarado: fd.get("declarado") === "on" || fd.get("declarado") === "true",
    });

    if ("ok" in r) {
      revalidatePath("/clinica/emergencia");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    const correlacaoId = logarErroSemPII("wrapper clinica/emergencia:", err);
    return { error: textoErroInterno(correlacaoId) };
  }
}
