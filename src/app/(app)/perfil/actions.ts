"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { declararEPsi } from "./logic";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { textoErroInterno } from "@/lib/copy/erros";

/**
 * D56 — só WRAPPERS aqui. O core ctx-accepting vive em `logic.ts`
 * (`server-only`): exportar função que aceita `ctx` de um módulo `"use server"`
 * a transforma em endpoint invocável pelo cliente com ctx forjado, o que é
 * bypass de RLS cross-tenant (#55). O guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 *
 * Sem `requireRole`: a declaração é do próprio profissional sobre o próprio
 * cadastro. Qualquer papel autenticado declara o seu, e ninguém declara o de
 * outro — a fronteira não é o papel, é o `app_user_id_exigido()` dentro de
 * `app_declarar_e_psi` (0133).
 */

export type PerfilState = { ok?: true; error?: string };

export async function declararEPsiAction(
  _prev: PerfilState,
  fd: FormData,
): Promise<PerfilState> {
  try {
    const ctx = await getTenantContext();

    const r = await declararEPsi(ctx, {
      declarado: fd.get("declarado") === "on" || fd.get("declarado") === "true",
      numero: String(fd.get("numero") ?? ""),
    });

    if ("ok" in r) {
      revalidatePath("/perfil");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    const correlacaoId = logarErroSemPII("wrapper perfil/e-psi:", err);
    return { error: textoErroInterno(correlacaoId) };
  }
}
