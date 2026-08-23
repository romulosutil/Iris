import { NextResponse } from "next/server";
import { getTenantContext } from "@/auth/tenant";
import { obterHistoricoExportacoes } from "@/lib/export/acervo/motor";

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
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
