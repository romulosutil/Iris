import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

// Lista de dúvidas abertas do terapeuta (Fase 5 · Fatia 1 · Task 5). RLS
// (`evidence_query_select`) já restringe às queries de evidências da equipe
// vigente do terapeuta (`app_is_on_team`) — ou toda a clínica se coordenador.

export type DuvidaAberta = {
  evidenceQueryId: string;
  evidenceId: string;
  patientId: string;
  sessionNumero: number;
  pergunta: string;
  criadoEm: string;
};

export async function listarDuvidasAbertas(ctx: TenantContext): Promise<DuvidaAberta[]> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT eq.id AS evidence_query_id, e.id AS evidence_id, e.patient_id,
             e.session_numero, eq.pergunta, eq.criado_em
      FROM evidence_query eq
      JOIN evidence e ON e.id = eq.evidence_id
      WHERE eq.respondido_em IS NULL
      ORDER BY eq.criado_em ASC
    `)) as unknown as {
      evidence_query_id: string;
      evidence_id: string;
      patient_id: string;
      session_numero: number;
      pergunta: string;
      criado_em: string;
    }[];

    return rows.map((r) => ({
      evidenceQueryId: r.evidence_query_id,
      evidenceId: r.evidence_id,
      patientId: r.patient_id,
      sessionNumero: r.session_numero,
      pergunta: r.pergunta,
      criadoEm: r.criado_em,
    }));
  });
}
