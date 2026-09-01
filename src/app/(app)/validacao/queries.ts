import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  avaliarFriccao,
  type FriccaoNivel,
} from "@/lib/extraction/review-policy";

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

// Evidência anterior do MESMO paciente + mesmo domínio/protocolo, exibida lado
// a lado quando o item da fila é inconsistente com o histórico (espelha o
// "historico" de `revisao/[sessionId]/queries.ts`, derivado em LEITURA).
export type HistoricoAnterior = {
  trecho: string;
  classificacao: unknown;
  criadoEm: string;
};

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
  /** Nível de fricção da §3 (fonte única: avaliarFriccao). */
  nivelFriccao: FriccaoNivel;
  /** Elegibilidade a aprovação em lote (fonte única: avaliarFriccao). */
  podeLote: boolean;
  /** Só populado para itens inconsistentes com o histórico. */
  historicoAnterior: HistoricoAnterior | null;
};

type Row = {
  evidence_id: string;
  patient_id: string;
  patient_nome: string;
  session_numero: number;
  protocol_id: string | null;
  dominio_id: string | null;
  classificacao_atual: unknown;
  trecho: string | null;
  confianca: "alta" | "media" | "baixa";
  inconsistente_com_historico: boolean;
};

type HistRow = {
  evidence_id: string;
  patient_id: string;
  protocol_id: string | null;
  dominio_id: string | null;
  classificacao_atual: unknown;
  trecho: string | null;
  criado_em: string;
};

// Chave de casamento com o histórico: mesmo protocolo + mesmo domínio do alvo
// (refs da própria `evidence`; NULL casa com NULL — item sem alvo resolvido
// compara com histórico igualmente sem alvo).
function chaveHistorico(r: {
  protocol_id: string | null;
  dominio_id: string | null;
}): string {
  return `${r.protocol_id ?? ""}|${r.dominio_id ?? ""}`;
}

// Contagem-only: mesmo predicado da fila, sem JOIN com `patient` (não afeta
// WHERE), sem mapear itens nem disparar a segunda query de histórico. Uso:
// badges/navegação que só precisam do total (ex. AppLayout, a cada render).
export async function contarFilaValidacao(
  ctx: TenantContext,
): Promise<{ total: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT count(*)::int AS total
      FROM evidence_current ec
      JOIN extraction x ON x.id = ec.extraction_id
      WHERE ec.invalidada = false
        AND (x.confianca = 'baixa' OR x.inconsistente_com_historico = true)
        AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
        AND NOT EXISTS (
          SELECT 1 FROM evidence_query q
          WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
        )
    `)) as unknown as { total: number }[];

    return { total: rows[0]?.total ?? 0 };
  });
}

export async function listarFilaValidacao(
  ctx: TenantContext,
): Promise<{ itens: ItemFila[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT ec.id AS evidence_id, ec.patient_id, p.nome AS patient_nome,
             ec.session_numero, ec.protocol_id, ec.dominio_id, ec.classificacao_atual,
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

    // Histórico só é necessário se houver item inconsistente: UMA query extra,
    // só leitura. `DISTINCT ON` traz APENAS a mais recente por (paciente,
    // protocolo, domínio) — sem carregar o histórico inteiro dos pacientes para
    // filtrar em JS. Itens da própria fila saem no SQL (senão o DISTINCT ON
    // escolheria o item da fila e descartaria o anterior real). `aprovado_em` é
    // NOT NULL no schema (default now()) — sem NULLS LAST nem filtro extra.
    const inconsistentes = rows.filter((r) => r.inconsistente_com_historico);
    const idsNaFila = [...new Set(rows.map((r) => r.evidence_id))];
    const histRows =
      inconsistentes.length > 0
        ? ((await tx.execute(sql`
            SELECT DISTINCT ON (ec.patient_id, ec.protocol_id, ec.dominio_id)
                   ec.id AS evidence_id, ec.patient_id, ec.protocol_id, ec.dominio_id,
                   ec.classificacao_atual, x.trecho_fonte AS trecho,
                   ec.aprovado_em::text AS criado_em
            FROM evidence_current ec
            JOIN extraction x ON x.id = ec.extraction_id
            WHERE ec.invalidada = false
              AND ec.patient_id IN (${sql.join(
                [...new Set(inconsistentes.map((r) => r.patient_id))].map(
                  (id) => sql`${id}::uuid`,
                ),
                sql`, `,
              )})
              AND ec.id NOT IN (${sql.join(
                idsNaFila.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
            ORDER BY ec.patient_id, ec.protocol_id, ec.dominio_id, ec.aprovado_em DESC
          `)) as unknown as HistRow[])
        : [];

    // Uma linha por (paciente, chave de domínio/protocolo) — já é a mais recente.
    const historicoPorChave = new Map<string, HistoricoAnterior>();
    for (const h of histRows) {
      historicoPorChave.set(`${h.patient_id}|${chaveHistorico(h)}`, {
        trecho: h.trecho ?? "",
        classificacao: h.classificacao_atual,
        criadoEm: h.criado_em,
      });
    }

    const itens: ItemFila[] = rows.map((r) => {
      const motivo: ItemFila["motivo"] = [];
      if (r.confianca === "baixa") motivo.push("baixa_confianca");
      if (r.inconsistente_com_historico) motivo.push("inconsistente_historico");
      const { podeLote, nivel } = avaliarFriccao({
        confianca: r.confianca,
        inconsistenteComHistorico: r.inconsistente_com_historico,
      });
      return {
        evidenceId: r.evidence_id,
        patientId: r.patient_id,
        patientNome: r.patient_nome,
        sessionNumero: r.session_numero,
        trecho: r.trecho ?? "",
        classificacaoAtual: r.classificacao_atual,
        motivo,
        protocolId: r.protocol_id,
        confianca: r.confianca,
        inconsistenteComHistorico: r.inconsistente_com_historico,
        nivelFriccao: nivel,
        podeLote,
        historicoAnterior: r.inconsistente_com_historico
          ? (historicoPorChave.get(`${r.patient_id}|${chaveHistorico(r)}`) ??
            null)
          : null,
      };
    });

    return { itens, total: itens.length };
  });
}
