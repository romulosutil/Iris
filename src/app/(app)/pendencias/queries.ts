import { and, desc, eq, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant, type TenantContext } from "@/db/rls";
import { extraction, patient, session, sessionNote } from "@/db/schema";

export type CapturaAConsolidar = {
  sessionId: string;
  pacienteNome: string | null;
  capturadoEm: Date;
};

export type ExtracaoPendente = {
  id: string;
  sessionId: string;
  pacienteNome: string | null;
  subtipo: string;
  criadoEm: Date;
};

export type SugestaoDemo = {
  id: string;
  sessionId: string;
  pacienteNome: string | null;
  subtipo: string;
  criadoEm: Date;
};

export type ListaPendencias = {
  capturasAConsolidar: CapturaAConsolidar[];
  extracaoPendente: ExtracaoPendente[];
  sugestoesDemo: SugestaoDemo[];
  total: number;
};

/**
 * Fila de pendências do dia: 3 categorias que exigem ação do terapeuta/equipe.
 * O RLS (via `withTenant`) já escopa cada tabela por clínica/papel — aqui só
 * filtramos por estado. Nenhuma query cruza tenant: `session`/`extraction`
 * herdam o isolamento da política de `session`.
 */
export async function listarPendencias(
  ctx: TenantContext,
): Promise<ListaPendencias> {
  // Subconsulta correlacionada: existe uma `nota_consolidada` para a MESMA
  // sessão da captura_rapida em avaliação. Alias necessário — a mesma tabela
  // aparece duas vezes na query (a linha candidata e a checagem de existência).
  const notaConsolidada = alias(sessionNote, "nota_consolidada");

  const capturasAConsolidar = await withTenant(ctx, (tx) =>
    tx
      .select({
        sessionId: session.id,
        pacienteNome: patient.nome,
        capturadoEm: sessionNote.criadoEm,
      })
      .from(sessionNote)
      .innerJoin(session, eq(session.id, sessionNote.sessionId))
      .leftJoin(patient, eq(patient.id, session.patientId))
      .where(
        and(
          eq(sessionNote.tipo, "captura_rapida"),
          notExists(
            tx
              .select({ id: notaConsolidada.id })
              .from(notaConsolidada)
              .where(
                and(
                  eq(notaConsolidada.sessionId, sessionNote.sessionId),
                  eq(notaConsolidada.tipo, "nota_consolidada"),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(sessionNote.criadoEm)),
  );

  const extracaoPendente = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: extraction.id,
        sessionId: extraction.sessionId,
        pacienteNome: patient.nome,
        subtipo: extraction.subtipo,
        criadoEm: extraction.criadoEm,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .leftJoin(patient, eq(patient.id, session.patientId))
      .where(eq(extraction.estado, "pendente_reprocessamento"))
      .orderBy(desc(extraction.criadoEm)),
  );

  const sugestoesDemo = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: extraction.id,
        sessionId: extraction.sessionId,
        pacienteNome: patient.nome,
        subtipo: extraction.subtipo,
        criadoEm: extraction.criadoEm,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .leftJoin(patient, eq(patient.id, session.patientId))
      .where(eq(extraction.estado, "sugerida"))
      .orderBy(desc(extraction.criadoEm)),
  );

  return {
    capturasAConsolidar,
    extracaoPendente,
    sugestoesDemo,
    total:
      capturasAConsolidar.length +
      extracaoPendente.length +
      sugestoesDemo.length,
  };
}
