"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { requireRole, RoleError } from "@/auth/require-role";
import { salvarDadosClinica } from "./logic";

/**
 * #262 — só WRAPPERS aqui. O core ctx-accepting vive em `logic.ts`
 * (`server-only`): exportar função que aceita `ctx` de um módulo `"use server"`
 * a transforma em endpoint invocável pelo cliente com ctx forjado, o que é
 * bypass de RLS cross-tenant (#55). O guard
 * `src/security/ctx-forjavel-guard.test.ts` quebra o CI se isso regredir.
 */

export type DadosClinicaState = { ok?: true; error?: string };

export async function salvarDadosClinicaAction(
  _prev: DadosClinicaState,
  fd: FormData,
): Promise<DadosClinicaState> {
  try {
    const ctx = await getTenantContext();
    requireRole(ctx, "coordenador");

    const r = await salvarDadosClinica(ctx, {
      razaoSocial: String(fd.get("razaoSocial") ?? ""),
      cpfCnpj: String(fd.get("cpfCnpj") ?? ""),
      logradouro: String(fd.get("logradouro") ?? ""),
      numero: String(fd.get("numero") ?? ""),
      complemento: String(fd.get("complemento") ?? ""),
      bairro: String(fd.get("bairro") ?? ""),
      cidade: String(fd.get("cidade") ?? ""),
      uf: String(fd.get("uf") ?? ""),
      cep: String(fd.get("cep") ?? ""),
      emailFinanceiro: String(fd.get("emailFinanceiro") ?? ""),
    });

    if ("ok" in r) {
      revalidatePath("/clinica/dados");
      return { ok: true };
    }
    return { error: r.error };
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    console.error("wrapper clinica/dados:", err);
    return { error: "Erro interno no servidor." };
  }
}
