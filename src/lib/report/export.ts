import { sql } from "drizzle-orm";
import type { Tx } from "../../db/rls";
import { sha256Hex } from "./hash";
import type { PdfRenderer } from "./renderer";

/**
 * Export = 1 transação (spec §5). Trade-off documentado: o ideal seria
 * renderizar totalmente fora de qualquer transação; como `exportReport`
 * recebe `tx` já aberto por `withTenant`, o render roda com a transação
 * aberta mas ANTES do `FOR UPDATE` — o lock em si é curto, só na fase de
 * escrita (fase 3/4). A trava contra a race é o recheck de
 * `payload_versao` sob `FOR UPDATE`: se o payload mudou entre a leitura
 * (fase 1) e o lock (fase 3), a transação aborta e NUNCA congela um PDF
 * gerado a partir de um payload obsoleto.
 */

export type ExportParams = {
  reportId: string;
  atorId: string;
  buildHtml: (payload: unknown) => string;
  renderer: PdfRenderer;
};

type ReportRow = {
  payload: unknown;
  payload_versao: number;
  status: string;
  patient_id: string;
  clinic_id: string;
};

type LockedRow = {
  payload_versao: number;
  status: string;
};

export async function exportReport(
  tx: Tx,
  params: ExportParams,
): Promise<{ hash: string }> {
  const { reportId, atorId, buildHtml, renderer } = params;

  // Fase 1: ler estado + versão (sem lock). RLS garante isolamento de tenant.
  const pre = await tx.execute(sql`
    SELECT payload, payload_versao, status, patient_id, clinic_id
    FROM report WHERE id = ${reportId}`);
  const row = (pre as unknown as ReportRow[])[0];
  if (!row) {
    throw new Error(`exportReport: report ${reportId} não visível`);
  }
  if (row.status !== "rascunho" && row.status !== "revisado") {
    throw new Error(`exportReport: status ${row.status} não exportável`);
  }
  const versao = row.payload_versao;

  // Fase 2: render + hash (com a tx aberta, mas fora do lock de escrita).
  const bytes = await renderer.render(buildHtml(row.payload));
  const hash = sha256Hex(bytes);

  // Fase 3: lock + recheck de versão — trava a race (spec §5).
  const locked = await tx.execute(sql`
    SELECT payload_versao, status FROM report WHERE id = ${reportId} FOR UPDATE`);
  const lrow = (locked as unknown as LockedRow[])[0];
  if (!lrow) {
    throw new Error(`exportReport: report ${reportId} sumiu`);
  }
  if (lrow.payload_versao !== versao) {
    throw new Error(
      `exportReport: payload_versao mudou (${versao} → ${lrow.payload_versao}); reinicie o export`,
    );
  }
  if (lrow.status !== "rascunho" && lrow.status !== "revisado") {
    throw new Error(`exportReport: status ${lrow.status} não exportável`);
  }

  // Fase 4: congela bytes + marca exportado + trilha (tudo na mesma tx).
  await tx.execute(sql`
    INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${reportId}, ${bytes}, ${hash})`);
  await tx.execute(sql`
    UPDATE report SET status = 'exportado', pdf_hash = ${hash},
      exportado_por = ${atorId}, exportado_em = now() WHERE id = ${reportId}`);
  await tx.execute(sql`
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
    VALUES (${row.clinic_id}, ${atorId}, 'relatorio_exportado', 'report', ${reportId}, ${row.patient_id},
            jsonb_build_object('hash', ${hash}::text))`);

  return { hash };
}
