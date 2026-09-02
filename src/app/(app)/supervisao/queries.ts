import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  type SinalTipo,
  type DetalheEstagnacao,
  type DetalheFaltas,
  type SnapshotRow,
  type FaltaCount,
  sinaisDeSnapshot,
  sinaisDeFaltas,
  chaveNatural,
} from "@/lib/supervisao/sinais";

export type ItemSupervisao = {
  chaveNatural: string;
  tipo: SinalTipo;
  patientId: string;
  patientNome: string;
  goalId: string | null;
  protocolId: string | null;
  goalNome: string | null;
  protocolNome: string | null;
  detalhe: DetalheEstagnacao | DetalheFaltas;
  estado: "novo" | "reconhecido";
  alertaId: string | null;
  sinalPresente: boolean;
};

type ClinicRow = {
  faltas_limiar: number;
  faltas_janela_semanas: number;
};

type SnapshotQueryRow = {
  patient_id: string;
  session_numero: number;
  segmentacao: any;
  patient_nome: string;
};

type AbsenceQueryRow = {
  patient_id: string;
  patient_nome: string;
  faltas: number;
};

type AlertaQueryRow = {
  id: string;
  chave_natural: string;
  status: "reconhecido" | "resolvido" | "descartado";
  patient_id: string;
  tipo: SinalTipo;
  goal_id: string | null;
  protocol_id: string | null;
  detalhe: any;
};

type NameRow = {
  id: string;
  nome: string;
};

export async function listarSupervisao(
  ctx: TenantContext,
): Promise<{ itens: ItemSupervisao[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    // 1. Config da clínica
    // `app_clinic_id_exigido()` e não `current_setting('app.clinic_id')::uuid`
    // (D16): o cast cru levanta 42704/22P02 com mensagem que não nomeia o
    // tenant. Era a única leitura da aplicação que ainda resolvia a clínica na
    // mão — todo o resto passa pelas policies, que a `0085` já converteu.
    const clinicRows = (await tx.execute(sql`
      SELECT faltas_limiar, faltas_janela_semanas
      FROM clinic
      WHERE id = app_clinic_id_exigido()
    `)) as unknown as ClinicRow[];

    const limit = clinicRows[0]?.faltas_limiar ?? 3;
    const windowWeeks = clinicRows[0]?.faltas_janela_semanas ?? 4;

    // 2. Sinais de snapshot
    const snapshotRows = (await tx.execute(sql`
      SELECT DISTINCT ON (ss.patient_id)
             ss.patient_id, ss.session_numero, ss.segmentacao, p.nome AS patient_nome
      FROM session_snapshot ss
      JOIN patient p ON p.id = ss.patient_id
      ORDER BY ss.patient_id, ss.session_numero DESC
    `)) as unknown as SnapshotQueryRow[];

    const mappedSnapshots: SnapshotRow[] = snapshotRows.map((r) => ({
      patientId: r.patient_id,
      sessionNumero: r.session_numero,
      segmentacao:
        typeof r.segmentacao === "string"
          ? JSON.parse(r.segmentacao)
          : r.segmentacao,
    }));
    const snapSignals = sinaisDeSnapshot(mappedSnapshots);

    // 3. Sinais de faltas
    const absenceRows = (await tx.execute(sql`
      SELECT s.patient_id, p.nome AS patient_nome, COUNT(*)::int AS faltas
      FROM session s
      JOIN patient p ON p.id = s.patient_id
      WHERE s.estado = 'falta_paciente'
        AND s.agendada_para >= now() - make_interval(weeks => ${windowWeeks})
      GROUP BY s.patient_id, p.nome
    `)) as unknown as AbsenceQueryRow[];

    const mappedAbsences: FaltaCount[] = absenceRows.map((r) => ({
      patientId: r.patient_id,
      faltas: r.faltas,
    }));
    const absenceSignals = sinaisDeFaltas(mappedAbsences, {
      limiar: limit,
      janelaSemanas: windowWeeks,
    });

    const liveSignals = [...snapSignals, ...absenceSignals];

    // Mapeamentos para resoluções de nomes
    const patientNames = new Map<string, string>();
    snapshotRows.forEach((r) => patientNames.set(r.patient_id, r.patient_nome));
    absenceRows.forEach((r) => patientNames.set(r.patient_id, r.patient_nome));

    // Pegar Goal e Protocol Names
    const goalIds = Array.from(
      new Set(
        snapSignals
          .map((s) => s.goalId)
          .filter((id): id is string => id !== null),
      ),
    );
    const protocolIds = Array.from(
      new Set(
        snapSignals
          .map((s) => s.protocolId)
          .filter((id): id is string => id !== null),
      ),
    );

    const goalNames = new Map<string, string>();
    if (goalIds.length > 0) {
      const goals = (await tx.execute(sql`
        SELECT id, descricao AS nome
        FROM goal
        WHERE id IN (${sql.join(
          goalIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `)) as unknown as NameRow[];
      goals.forEach((g) => goalNames.set(g.id, g.nome));
    }

    const protocolNames = new Map<string, string>();
    if (protocolIds.length > 0) {
      const protocols = (await tx.execute(sql`
        SELECT id, nome
        FROM protocol
        WHERE id IN (${sql.join(
          protocolIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `)) as unknown as NameRow[];
      protocols.forEach((p) => protocolNames.set(p.id, p.nome));
    }

    // 5. Overlay do livro-razão (alerta)
    const alertaRows = (await tx.execute(sql`
      SELECT id, chave_natural, status, patient_id, tipo, goal_id, protocol_id, detalhe
      FROM alerta
      WHERE deletado_em IS NULL
    `)) as unknown as AlertaQueryRow[];

    const alertMap = new Map(alertaRows.map((r) => [r.chave_natural, r]));

    const itens: ItemSupervisao[] = [];
    const liveKeys = new Set<string>();

    for (const signal of liveSignals) {
      const ch = chaveNatural(signal);
      liveKeys.add(ch);

      const alert = alertMap.get(ch);
      if (alert) {
        if (alert.status === "resolvido" || alert.status === "descartado") {
          continue; // suprime
        }
        if (alert.status === "reconhecido") {
          itens.push({
            chaveNatural: ch,
            tipo: signal.tipo,
            patientId: signal.patientId,
            patientNome: patientNames.get(signal.patientId) || "",
            goalId: signal.goalId,
            protocolId: signal.protocolId,
            goalNome: signal.goalId
              ? goalNames.get(signal.goalId) || null
              : null,
            protocolNome: signal.protocolId
              ? protocolNames.get(signal.protocolId) || null
              : null,
            detalhe: signal.detalhe,
            estado: "reconhecido",
            alertaId: alert.id,
            sinalPresente: true,
          });
        }
      } else {
        itens.push({
          chaveNatural: ch,
          tipo: signal.tipo,
          patientId: signal.patientId,
          patientNome: patientNames.get(signal.patientId) || "",
          goalId: signal.goalId,
          protocolId: signal.protocolId,
          goalNome: signal.goalId ? goalNames.get(signal.goalId) || null : null,
          protocolNome: signal.protocolId
            ? protocolNames.get(signal.protocolId) || null
            : null,
          detalhe: signal.detalhe,
          estado: "novo",
          alertaId: null,
          sinalPresente: true,
        });
      }
    }

    // 6. Alerta com status reconhecido mas sem sinal vivo correspondente ("sinal cessou")
    for (const alert of alertaRows) {
      if (
        alert.status === "reconhecido" &&
        !liveKeys.has(alert.chave_natural)
      ) {
        // Enriquecer nomes de paciente, goal, protocol se não estiverem no map
        if (!patientNames.has(alert.patient_id)) {
          const patientRow = (await tx.execute(sql`
            SELECT id, nome FROM patient WHERE id = ${alert.patient_id}::uuid
          `)) as unknown as NameRow[];
          if (patientRow[0]) {
            patientNames.set(alert.patient_id, patientRow[0].nome);
          }
        }

        if (alert.goal_id && !goalNames.has(alert.goal_id)) {
          const goalRow = (await tx.execute(sql`
            SELECT id, descricao AS nome FROM goal WHERE id = ${alert.goal_id}::uuid
          `)) as unknown as NameRow[];
          if (goalRow[0]) {
            goalNames.set(alert.goal_id, goalRow[0].nome);
          }
        }

        if (alert.protocol_id && !protocolNames.has(alert.protocol_id)) {
          const protocolRow = (await tx.execute(sql`
            SELECT id, nome FROM protocol WHERE id = ${alert.protocol_id}::uuid
          `)) as unknown as NameRow[];
          if (protocolRow[0]) {
            protocolNames.set(alert.protocol_id, protocolRow[0].nome);
          }
        }

        const det =
          typeof alert.detalhe === "string"
            ? JSON.parse(alert.detalhe)
            : alert.detalhe;

        itens.push({
          chaveNatural: alert.chave_natural,
          tipo: alert.tipo,
          patientId: alert.patient_id,
          patientNome: patientNames.get(alert.patient_id) || "",
          goalId: alert.goal_id,
          protocolId: alert.protocol_id,
          goalNome: alert.goal_id ? goalNames.get(alert.goal_id) || null : null,
          protocolNome: alert.protocol_id
            ? protocolNames.get(alert.protocol_id) || null
            : null,
          detalhe: det,
          estado: "reconhecido",
          alertaId: alert.id,
          sinalPresente: false,
        });
      }
    }

    // 7. Ordenar: novo primeiro, depois reconhecido. Dentro de cada grupo, por patientNome
    itens.sort((a, b) => {
      if (a.estado !== b.estado) {
        return a.estado === "novo" ? -1 : 1;
      }
      return a.patientNome.localeCompare(b.patientNome);
    });

    return { itens, total: itens.length };
  });
}

// ─── DA-01 (#535): "Saúde da IA" ─────────────────────────────────────────────

/** Uma linha da view `metricas_extracao_por_clinica_semana` (migração 0148):
 * semana ISO × modelo × versão do prompt. Sem PII por construção. */
export type SaudeIaLinha = {
  /** Segunda-feira da semana ISO, `YYYY-MM-DD`. */
  semanaInicio: string;
  /** `IYYY-Www`, ex.: `2026-W36`. */
  semanaIso: string;
  modelo: string | null;
  promptVersao: string | null;
  totalSugeridas: number;
  aprovadasSemEdicao: number;
  editadas: number;
  descartadas: number;
  /** DLQ da revisão (`erro_validacao`, #532): decisão humana que não gravou. */
  erroValidacao: number;
  /** Chamadas que falharam (`pendente_reprocessamento`). */
  pendentes: number;
  medianaSegundosAteRevisao: number | null;
  medianaLatenciaMs: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
};

type SaudeIaRow = {
  semana_inicio: string;
  semana_iso: string;
  modelo: string | null;
  prompt_versao: string | null;
  total_sugeridas: number;
  aprovadas_sem_edicao: number;
  editadas: number;
  descartadas: number;
  erro_validacao: number;
  pendentes: number;
  mediana_segundos_ate_revisao: number | null;
  mediana_latencia_ms: number | null;
  tokens_entrada: string | number | null;
  tokens_saida: string | number | null;
};

/** `bigint` chega como string pelo driver; `null` fica `null` (não 0). */
function inteiroOuNull(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number(v);
}

export const SAUDE_IA_SEMANAS_PADRAO = 8;

/**
 * Lê a view de métricas da extração para a clínica do contexto, das últimas
 * `semanas` semanas ISO (inclusive a corrente), mais recente primeiro.
 *
 * Isolamento e papel são impostos NA VIEW (`app_clinic_id_exigido()` +
 * `app.user_role = 'coordenador'`), não aqui: para qualquer outro papel a
 * view devolve zero linhas, e sem tenant no GUC ela levanta P0001.
 */
export async function listarSaudeIa(
  ctx: TenantContext,
  opcoes: { semanas?: number } = {},
): Promise<SaudeIaLinha[]> {
  const semanas = Math.max(1, opcoes.semanas ?? SAUDE_IA_SEMANAS_PADRAO);
  return withTenant(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT semana_inicio::text AS semana_inicio, semana_iso, modelo, prompt_versao,
             total_sugeridas, aprovadas_sem_edicao, editadas, descartadas,
             erro_validacao, pendentes,
             mediana_segundos_ate_revisao, mediana_latencia_ms,
             tokens_entrada, tokens_saida
      FROM metricas_extracao_por_clinica_semana
      -- "agora" no fuso da clínica (D61), o mesmo calendário que a view usa
      -- para semana_inicio; sem isto a janela de N semanas escorregaria na
      -- virada de semana em Brasília (banco em UTC).
      WHERE semana_inicio >= (
        date_trunc('week', now() AT TIME ZONE (SELECT timezone FROM clinic WHERE id = app_clinic_id_exigido()))
        - (${semanas - 1} * interval '1 week')
      )::date
      ORDER BY semana_inicio DESC, modelo NULLS LAST, prompt_versao NULLS LAST
    `)) as unknown as SaudeIaRow[];
    return rows.map((r) => ({
      semanaInicio: r.semana_inicio,
      semanaIso: r.semana_iso,
      modelo: r.modelo,
      promptVersao: r.prompt_versao,
      totalSugeridas: r.total_sugeridas,
      aprovadasSemEdicao: r.aprovadas_sem_edicao,
      editadas: r.editadas,
      descartadas: r.descartadas,
      erroValidacao: r.erro_validacao,
      pendentes: r.pendentes,
      medianaSegundosAteRevisao: r.mediana_segundos_ate_revisao,
      medianaLatenciaMs: r.mediana_latencia_ms,
      tokensEntrada: inteiroOuNull(r.tokens_entrada),
      tokensSaida: inteiroOuNull(r.tokens_saida),
    }));
  });
}
