import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import type { PdfRenderer } from "@/lib/report/renderer";
import { exportReport } from "@/lib/report/export";
import { erroDeActionSeRenderOcupado } from "@/lib/report/render-lock";
import { buildConvenioBrutoPayload } from "@/lib/report/convenio-bruto/build-payload";
import { buildConvenioBrutoHtml } from "@/lib/report/convenio-bruto/build-html";
import type { PayloadConvenioBruto } from "@/lib/report/convenio-bruto/types";
import { playwrightRenderer } from "@/lib/report/playwright-renderer";

export const exportarSchema = z.object({
  patientId: z.string().uuid(),
  nomePaciente: z.string().min(1),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ExportarInput = z.infer<typeof exportarSchema>;

/** Núcleo testável — recebe ctx (nunca do request) + renderer injetável. */
export async function exportarConvenioBruto(
  ctx: TenantContext,
  input: ExportarInput,
  renderer: PdfRenderer = playwrightRenderer,
): Promise<{ reportId: string; hash: string } | { error: string }> {
  const parsed = exportarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }
  const { patientId, nomePaciente, periodoInicio, periodoFim } = parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      const payload = await buildConvenioBrutoPayload(tx, {
        patientId,
        nomePaciente,
        periodoInicio,
        periodoFim,
      });
      const rows = (await tx.execute(sql`
      INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload, gerado_por_ia)
      VALUES (${ctx.clinicId}::uuid, ${patientId}::uuid, 'convenio_bruto', ${periodoInicio}::date, ${periodoFim}::date, 'rascunho', ${JSON.stringify(payload)}::jsonb, false)
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
      const reportId = rows[0]!.id;
      const { hash } = await exportReport(tx, {
        reportId,
        atorId: ctx.userId,
        buildHtml: (pl) => buildConvenioBrutoHtml(pl as PayloadConvenioBruto),
        renderer,
      });
      return { reportId, hash };
    });
  } catch (err) {
    // PF-02 (#538): semáforo do PDF estourou o teto de espera → contrato de
    // erro da action com a copy amigável, em vez de 500.
    const ocupado = erroDeActionSeRenderOcupado(err);
    if (ocupado) return ocupado;
    throw err;
  }
}
