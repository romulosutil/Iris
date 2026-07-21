// Preview FACTUAL (read-only) do dossiê convenio_bruto (Fase 5 · Fatia 3).
// Reusa `buildConvenioBrutoPayload` (Task 2) para derivar contagens; não
// grava nada. Roda sob RLS via `withTenant` — ctx-accepting (não
// "use server"), mesmo padrão de src/app/(app)/validacao/queries.ts.
import "server-only";
import { withTenant, type TenantContext } from "@/db/rls";
import { buildConvenioBrutoPayload } from "@/lib/report/convenio-bruto/build-payload";

type PreviewArgs = { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string };

export async function previewConvenioBruto(ctx: TenantContext, args: PreviewArgs): Promise<{
  sessoesRealizadas: number;
  faltasJustificadas: number;
  evidenciasAprovadas: number;
}> {
  return withTenant(ctx, async (tx) => {
    const p = await buildConvenioBrutoPayload(tx, args);
    return {
      sessoesRealizadas: p.presenca.sessoesRealizadas,
      faltasJustificadas: p.presenca.faltasJustificadas,
      evidenciasAprovadas: p.evidencias.length,
    };
  });
}
