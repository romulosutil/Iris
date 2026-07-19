import { sql } from "drizzle-orm";
import type { Tx } from "../../db/rls";

type ReportPdfRow = {
  bytes: Buffer;
  hash: string;
};

/**
 * Re-download serve o snapshot congelado em `report_pdf` — nunca
 * re-renderiza. RLS (via `tx` de `withTenant`) esconde reports de outra
 * clínica, resultando em `null`.
 */
export async function getReportPdf(
  tx: Tx,
  reportId: string,
): Promise<{ bytes: Buffer; hash: string } | null> {
  const res = await tx.execute(
    sql`SELECT bytes, hash FROM report_pdf WHERE report_id = ${reportId}`,
  );
  const row = (res as unknown as ReportPdfRow[])[0];
  if (!row) return null;
  return { bytes: row.bytes, hash: row.hash };
}
