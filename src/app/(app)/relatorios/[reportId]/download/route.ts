import { NextResponse } from "next/server";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { getReportPdf } from "@/lib/report/download";

/**
 * Download do dossiê já exportado (Task 7). Serve os bytes CONGELADOS de
 * `report_pdf` — nunca re-renderiza (`getReportPdf` só lê). RLS via
 * `withTenant` esconde reports de outra clínica; `null` vira 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const ctx = await getTenantContext();

  const pdf = await withTenant(ctx, (tx) => getReportPdf(tx, reportId));
  if (!pdf) {
    return NextResponse.json(
      { error: "Relatório não encontrado." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossie-convenio-${reportId}.pdf"`,
    },
  });
}
