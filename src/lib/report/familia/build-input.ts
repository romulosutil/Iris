// Builder da entrada FACTUAL do Relatório de Família (Fase 5 · Fatia 4).
// Roda DENTRO de uma transação já aberta por `withTenant` (GUCs de tenant já
// setados) — recebe `tx`, não `ctx`. Só leitura determinística sob RLS: nenhum
// número aqui é gerado por IA (docs/agente/agente-2-relatorio-familia.md — IA
// nunca gera número; ela só narra a partir desta entrada).
import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/rls";
import type { FamilyReportInput } from "./types";

type Args = {
  patientId: string;
  nomeCrianca: string;
  periodoInicio: string;
  periodoFim: string;
};

type EvidRow = {
  data: string;
  meta: string;
  nivel_ajuda: string | null;
  polaridade: string | null;
};

type NomeRow = { descricao: string };
type ReforcadorRow = { item_atividade: string };

export async function buildFamiliaInput(
  tx: Tx,
  args: Args,
): Promise<FamilyReportInput> {
  const { patientId, nomeCrianca, periodoInicio, periodoFim } = args;

  // Evidências aprovadas no período. Nome do domínio em linguagem simples
  // (F1: prefere descricao da meta; evita protocol_slug, que é jargão).
  const evidRows = (await tx.execute(sql`
    SELECT to_char(e.aprovado_em, 'YYYY-MM-DD') AS data,
           COALESCE(g.descricao, e.goal_ref, e.dominio_id, 'atividade') AS meta,
           e.classificacao_original->>'nivel_ajuda' AS nivel_ajuda,
           e.classificacao_original->>'polaridade' AS polaridade
    FROM evidence e
    LEFT JOIN goal g ON g.id = e.goal_id
    WHERE e.patient_id = ${patientId}::uuid
      AND e.aprovado_em >= ${periodoInicio}::date
      AND e.aprovado_em < (${periodoFim}::date + 1)
    ORDER BY e.aprovado_em
  `)) as unknown as EvidRow[];

  // Metas ativas do paciente, em linguagem simples (F4).
  const metaRows = (await tx.execute(sql`
    SELECT descricao FROM goal
    WHERE patient_id = ${patientId}::uuid AND estado = 'ativa'
    ORDER BY criado_em
  `)) as unknown as NomeRow[];

  // Reforçadores atuais (F5): item cuja valência MAIS RECENTE é 'alta'
  // (saciado/baixa rebaixam). `DISTINCT ON` por item, ordenado por recência.
  const reforcadorRows = (await tx.execute(sql`
    SELECT item_atividade FROM (
      SELECT DISTINCT ON (item_atividade) item_atividade, valencia
      FROM reinforcer_profile
      WHERE patient_id = ${patientId}::uuid
      ORDER BY item_atividade, session_numero DESC
    ) atual
    WHERE valencia = 'alta'
  `)) as unknown as ReforcadorRow[];

  return {
    crianca: { nome: nomeCrianca },
    periodo: { inicio: periodoInicio, fim: periodoFim },
    evidenciasAprovadas: evidRows.map((r) => ({
      data: String(r.data),
      metaOuDominio: String(r.meta),
      nivelAjuda: r.nivel_ajuda === null ? null : String(r.nivel_ajuda),
      polaridade:
        r.polaridade === "positiva" || r.polaridade === "negativa"
          ? r.polaridade
          : null,
    })),
    metasAtivas: metaRows.map((r) => String(r.descricao)),
    reforcadoresAtuais: reforcadorRows.map((r) => String(r.item_atividade)),
    // MilestoneAssessment formal deferido (Fase 5); array vazio, stub não fabrica.
    avaliacoesFormais: [],
  };
}
