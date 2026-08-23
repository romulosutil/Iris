"use server";

import { getTenantContext } from "@/auth/tenant";
import {
  solicitarExportacao,
  gerarLinkDownload,
} from "@/lib/export/acervo/motor";

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

export type ResultadoLinkDownload =
  { ok: true; url: string } | { ok: false; error: string };

/**
 * Cunha um link de download novo para um bundle pronto.
 *
 * O token só existe em texto claro nesta resposta — o banco guarda o SHA-256.
 * Cada chamada revoga o link anterior.
 */
export async function gerarLinkDownloadAction(
  bundleId: string,
): Promise<ResultadoLinkDownload> {
  try {
    const ctx = await getTenantContext();
    const { url } = await gerarLinkDownload(
      ctx.clinicId,
      ctx.userId,
      ctx.role,
      bundleId,
    );
    return { ok: true, url };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
