import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";

// Fila de validação do coordenador (Fase 5 · Fatia 1). Derivada por LEITURA
// (sem coluna nova, sem migração) a partir de `evidence_current` (view de
// evidence.md — expõe `classificacao_atual`/`invalidada`), junta com
// `extraction` (confiança/inconsistência — o texto do trecho vem daqui,
// `trecho_fonte`, não de `session`: `evidence` não guarda o texto bruto do
// diário, e a VIEW não faz join com session) e `patient` (nome). RLS
// (`withTenant`) já escopa: coordenador vê a clínica inteira.
//
// Predicado da fila: baixa confiança OU inconsistente com histórico, E ainda
// não tratada (sem evidence_revision), E sem evidence_query aberta
// (respondido_em IS NULL), E não invalidada.

export type ItemFila = {
  evidenceId: string;
  patientId: string;
  patientNome: string;
  sessionNumero: number;
  trecho: string;
  classificacaoAtual: unknown;
  motivo: ("baixa_confianca" | "inconsistente_historico")[];
  protocolId: string | null;
  confianca: "alta" | "media" | "baixa";
  inconsistenteComHistorico: boolean;
};

type Row = {
  evidence_id: string;
  patient_id: string;
  patient_nome: string;
  session_numero: number;
  protocol_id: string | null;
  classificacao_atual: unknown;
  trecho: string | null;
  confianca: string;
  inconsistente_com_historico: boolean;
};

export async function listarFilaValidacao(
  ctx: TenantContext,
): Promise<{ itens: ItemFila[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT ec.id AS evidence_id, ec.patient_id, p.nome AS patient_nome,
             ec.session_numero, ec.protocol_id, ec.classificacao_atual,
             x.trecho_fonte AS trecho,
             x.confianca, x.inconsistente_com_historico
      FROM evidence_current ec
      JOIN extraction x ON x.id = ec.extraction_id
      JOIN patient p ON p.id = ec.patient_id
      WHERE ec.invalidada = false
        AND (x.confianca = 'baixa' OR x.inconsistente_com_historico = true)
        AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
        AND NOT EXISTS (
          SELECT 1 FROM evidence_query q
          WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
        )
      ORDER BY ec.session_numero ASC, ec.alvo_ordinal ASC
    `)) as unknown as Row[];

    const itens: ItemFila[] = rows.map((r) => {
      const motivo: ItemFila["motivo"] = [];
      if (r.confianca === "baixa") motivo.push("baixa_confianca");
      if (r.inconsistente_com_historico) motivo.push("inconsistente_historico");
      return {
        evidenceId: r.evidence_id,
        patientId: r.patient_id,
        patientNome: r.patient_nome,
        sessionNumero: r.session_numero,
        trecho: r.trecho ?? "",
        classificacaoAtual: r.classificacao_atual,
        motivo,
        protocolId: r.protocol_id,
        confianca: r.confianca as "alta" | "media" | "baixa",
        inconsistenteComHistorico: r.inconsistente_com_historico,
      };
    });

    return { itens, total: itens.length };
  });
}
