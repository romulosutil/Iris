// Preview FACTUAL (read-only) do dossiê convenio_bruto (Fase 5 · Fatia 3).
// Reusa `buildConvenioBrutoPayload` (Task 2) para derivar contagens; não
// grava nada. Roda sob RLS via `withTenant` — ctx-accepting (não
// "use server"), mesmo padrão de src/app/(app)/validacao/queries.ts.
import "server-only";
import { asc, eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { buildConvenioBrutoPayload } from "@/lib/report/convenio-bruto/build-payload";

/**
 * Pacientes para o seletor da rota `/relatorios` (Task 7). A política RLS
 * `patient_select` (db/migrations/0001_rls.sql) já restringe este SELECT ao
 * que o papel pode ver: coordenador vê toda a clínica, terapeuta só vê
 * pacientes da própria equipe — nenhum filtro adicional em app é necessário
 * aqui. Lista pequena por clínica, sem paginação.
 */
export async function listarPacientesParaRelatorio(
  ctx: TenantContext,
): Promise<{ id: string; nome: string }[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: schema.patient.id, nome: schema.patient.nome })
      .from(schema.patient)
      .where(eq(schema.patient.clinicId, ctx.clinicId))
      .orderBy(asc(schema.patient.nome)),
  );
}

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
