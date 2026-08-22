"use server";

import { getTenantContext } from "@/auth/tenant";
import { solicitarExportacao } from "@/lib/export/acervo/motor";

export type ResultadoSolicitacao =
  | {
      ok: true;
      bundleId: string;
      status: "pendente";
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Server Action para solicitar a exportação integral do acervo.
 * Funciona com conta ativa ou em somente-leitura (D10).
 */
export async function solicitarExportacaoAction(): Promise<ResultadoSolicitacao> {
  try {
    const ctx = await getTenantContext();
    const res = await solicitarExportacao(ctx.clinicId, ctx.userId, ctx.role);
    return { ok: true, bundleId: res.bundleId, status: res.status };
  } catch (err: any) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
