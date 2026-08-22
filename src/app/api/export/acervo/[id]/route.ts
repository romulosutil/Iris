import { NextResponse } from "next/server";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { baixarBundleAcervo } from "@/lib/export/acervo/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  const ctx = await getTenantContext();

  const resultado = await withTenant(ctx, (tx) =>
    baixarBundleAcervo(tx, {
      bundleId: id,
      token,
      userId: ctx.userId,
      userRole: ctx.role,
    }),
  );

  if (!resultado.sucesso) {
    return NextResponse.json(
      { error: resultado.erro },
      { status: resultado.statusHttp },
    );
  }

  return new NextResponse(new Uint8Array(resultado.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${resultado.filename}"`,
      "Content-Length": String(resultado.bytes.length),
    },
  });
}
