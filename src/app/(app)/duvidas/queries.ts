import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

// Lista de dúvidas abertas do terapeuta (Fase 5 · Fatia 1 · Task 5). RLS
// (`evidence_query_select`) já restringe às queries de evidências da equipe
// vigente do terapeuta (`app_is_on_team`) — ou toda a clínica se coordenador.
//
// Enriquecida com o mesmo contexto que o coordenador vê na fila de validação
// (`listarFilaValidacao`, `validacao/queries.ts`): o terapeuta precisa ver o
// trecho de evidência (`extraction.trecho_fonte`) e a classificação atual
// (`evidence_current.classificacao_atual`) para responder a dúvida com
// contexto, não às cegas. Mesmos joins da fila do coordenador — evidence →
// extraction (trecho) → evidence_current (classificação) — só que partindo
// de `evidence_query` em vez de `evidence_current` diretamente.

export type DuvidaAberta = {
  evidenceQueryId: string;
  evidenceId: string;
  patientId: string;
  sessionNumero: number;
  pergunta: string;
  criadoEm: string;
  trecho: string;
  classificacaoAtual: unknown;
};

export async function listarDuvidasAbertas(
  ctx: TenantContext,
): Promise<DuvidaAberta[]> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT eq.id AS evidence_query_id, e.id AS evidence_id, e.patient_id,
             e.session_numero, eq.pergunta, eq.criado_em,
             x.trecho_fonte AS trecho, ec.classificacao_atual
      FROM evidence_query eq
      JOIN evidence e ON e.id = eq.evidence_id
      JOIN extraction x ON x.id = e.extraction_id
      JOIN evidence_current ec ON ec.id = e.id
      WHERE eq.respondido_em IS NULL
      ORDER BY eq.criado_em ASC
    `)) as unknown as {
      evidence_query_id: string;
      evidence_id: string;
      patient_id: string;
      session_numero: number;
      pergunta: string;
      criado_em: string;
      trecho: string | null;
      classificacao_atual: unknown;
    }[];

    return rows.map((r) => ({
      evidenceQueryId: r.evidence_query_id,
      evidenceId: r.evidence_id,
      patientId: r.patient_id,
      sessionNumero: r.session_numero,
      pergunta: r.pergunta,
      criadoEm: r.criado_em,
      trecho: r.trecho ?? "",
      classificacaoAtual: r.classificacao_atual,
    }));
  });
}
