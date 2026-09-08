"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { textoErroInterno } from "@/lib/copy/erros";
import { TAMANHO_MAX_LOGO_BYTES } from "@/lib/branding/marca";
import { salvarMarca } from "./logic";

/**
 * #258 (D9) — só WRAPPERS aqui. O core ctx-accepting vive em `logic.ts`
 * (`server-only`): exportar função que aceita `ctx` de um módulo `"use server"`
 * a transforma em endpoint invocável pelo cliente com ctx forjado, o que é
 * bypass de RLS cross-tenant (#55). O guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type MarcaState = { ok?: true; error?: string };

export async function salvarMarcaAction(
  _prev: MarcaState,
  fd: FormData,
): Promise<MarcaState> {
  try {
    const ctx = await getTenantContext();
    requireRole(ctx, "coordenador");

    const arquivo = fd.get("logo");
    let logo: Buffer | null = null;
    if (arquivo instanceof File && arquivo.size > 0) {
      // Teto ANTES de materializar o arquivo em memória: `arrayBuffer()` de um
      // upload de 500 MB derrubaria o processo antes de qualquer validação de
      // conteúdo. `File.size` é metadado do stream, não exige a leitura.
      if (arquivo.size > TAMANHO_MAX_LOGO_BYTES) {
        return {
          error: `O logotipo tem ${(arquivo.size / 1024 / 1024).toFixed(2)} MB e o limite é 2 MB.`,
        };
      }
      logo = Buffer.from(await arquivo.arrayBuffer());
    }

    const r = await salvarMarca(ctx, {
      corPrimaria: String(fd.get("corPrimaria") ?? ""),
      logo,
      removerLogo:
        fd.get("removerLogo") === "on" || fd.get("removerLogo") === "true",
    });

    if ("ok" in r) {
      revalidatePath("/clinica/marca");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    const correlacaoId = logarErroSemPII("wrapper clinica/marca:", err);
    return { error: textoErroInterno(correlacaoId) };
  }
}
