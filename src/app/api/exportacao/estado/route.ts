import { NextResponse } from "next/server";
import { getTenantContext } from "@/auth/tenant";
import { obterHistoricoExportacoes } from "@/lib/export/acervo/motor";
import { textoErroInterno } from "@/lib/copy/erros";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint de consulta de estado para polling do cliente (§5.2 / Design §5).
 */
export async function GET() {
  try {
    const ctx = await getTenantContext();
    const dados = await obterHistoricoExportacoes(
      ctx.clinicId,
      ctx.userId,
      ctx.role,
    );
    return NextResponse.json(dados);
  } catch (err: unknown) {
    // S-10 (#531): nunca `err.message` na resposta — erro de driver carrega
    // SQL + params. Copy + código de correlação do log.
    const correlacaoId = logarErroSemPII("[exportacao/estado] leitura:", err);
    return NextResponse.json(
      { error: textoErroInterno(correlacaoId) },
      { status: 500 },
    );
  }
}
