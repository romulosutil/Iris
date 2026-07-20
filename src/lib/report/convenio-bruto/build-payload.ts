// Builder de payload FACTUAL do dossiê convenio_bruto (Fase 5 · Fatia 3).
// Roda DENTRO de uma transação já aberta por `withTenant` (GUCs de tenant já
// setados) — recebe `tx`, não `ctx`. Único ponto que agrega `session` +
// `evidence` sob RLS para o relatório de convênio: nenhum número aqui é
// gerado por IA, só leitura/contagem determinística do banco (ver
// docs/agente/agente-2-relatorio-familia.md — IA nunca gera número).
import { sql } from "drizzle-orm";
import type { Tx } from "../../../db/rls";
import type { PayloadConvenioBruto } from "./types";

type Args = {
  patientId: string;
  nomePaciente: string;
  periodoInicio: string;
  periodoFim: string;
};

type SessaoRow = {
  num: number | null;
  data: string;
  disciplina: string;
  modalidade: string;
  estado: string;
  justificada: boolean | null;
  terapeuta: string;
};

type EvidenciaRow = {
  data: string;
  meta: string;
  classificacao: string;
  autor: string;
};

export async function buildConvenioBrutoPayload(tx: Tx, args: Args): Promise<PayloadConvenioBruto> {
  const { patientId, nomePaciente, periodoInicio, periodoFim } = args;

  // Limite superior EXCLUSIVO do dia seguinte ao fim: inclui o dia inteiro de
  // `periodoFim` (sessões/evidências têm timestamp, não date) sem precisar de
  // cast por linha na coluna (mantém sargable via idx_session_clinic_dia).
  const sessoesRows = (await tx.execute(sql`
    SELECT s.numero_sequencial_paciente AS num, to_char(s.agendada_para, 'YYYY-MM-DD') AS data,
           s.disciplina, s.modalidade::text AS modalidade, s.estado::text AS estado, s.justificada, u.name AS terapeuta
    FROM session s JOIN app_user u ON u.id = s.terapeuta_id
    WHERE s.patient_id = ${patientId}::uuid
      AND s.agendada_para >= ${periodoInicio}::date
      AND s.agendada_para < (${periodoFim}::date + 1)
    ORDER BY s.agendada_para
  `)) as unknown as SessaoRow[];

  const evidRows = (await tx.execute(sql`
    SELECT to_char(e.aprovado_em, 'YYYY-MM-DD') AS data,
           COALESCE(e.goal_ref, e.protocol_slug, e.dominio_id, 'n/d') AS meta,
           e.classificacao_original::text AS classificacao, u.name AS autor
    FROM evidence e JOIN app_user u ON u.id = e.aprovado_por
    WHERE e.patient_id = ${patientId}::uuid
      AND e.aprovado_em >= ${periodoInicio}::date
      AND e.aprovado_em < (${periodoFim}::date + 1)
    ORDER BY e.aprovado_em
  `)) as unknown as EvidenciaRow[];

  const sessoes = sessoesRows.map((r) => ({
    numeroSequencial: r.num === null ? null : Number(r.num),
    data: String(r.data),
    disciplina: String(r.disciplina),
    modalidade: String(r.modalidade),
    estado: String(r.estado),
    justificada: r.justificada === null ? null : Boolean(r.justificada),
    terapeuta: String(r.terapeuta),
  }));

  const evidencias = evidRows.map((r) => ({
    data: String(r.data),
    metaOuDominio: String(r.meta),
    classificacao: String(r.classificacao),
    autor: String(r.autor),
  }));

  const presenca = {
    sessoesRealizadas: sessoes.filter((s) => s.estado === "realizada").length,
    faltasJustificadas: sessoes.filter((s) => s.estado.startsWith("falta") && s.justificada === true).length,
    faltasNaoJustificadas: sessoes.filter((s) => s.estado.startsWith("falta") && s.justificada !== true).length,
  };

  return {
    paciente: { nome: nomePaciente },
    periodo: { inicio: periodoInicio, fim: periodoFim },
    geradoEm: new Date().toISOString(),
    sessoes,
    evidencias,
    presenca,
  };
}
