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
import { lerSegmentacao } from "@/lib/evidence/snapshot-schema";

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
  segmentacao: unknown;
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
  detalhe: unknown;
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
      // Forma única do snapshot (A-06). `sinais.ts` ainda declara
      // `metrica: string`, mas o banco grava um objeto — o cast é explícito
      // para o desencontro ficar visível, não escondido num `any`.
      segmentacao: lerSegmentacao(
        r.segmentacao,
      ) as unknown as SnapshotRow["segmentacao"],
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
    const alertasCessados = alertaRows.filter(
      (a) => a.status === "reconhecido" && !liveKeys.has(a.chave_natural),
    );

    // PF-01 (#538): nomes que ainda faltam resolvidos em UM lote por tabela
    // (antes: até 3 SELECTs por alerta, dentro do for). Proporcional ao
    // histórico de alertas da clínica — a tela do coordenador crescia com ele.
    const faltam = (ids: (string | null)[], ja: Map<string, string>) =>
      Array.from(
        new Set(ids.filter((id): id is string => !!id && !ja.has(id))),
      );
    const resolverNomes = async (
      tabela: "patient" | "goal" | "protocol",
      ids: string[],
      destino: Map<string, string>,
    ) => {
      if (ids.length === 0) return;
      const lista = sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      const rows = (await (tabela === "patient"
        ? tx.execute(sql`SELECT id, nome FROM patient WHERE id IN (${lista})`)
        : tabela === "goal"
          ? tx.execute(
              sql`SELECT id, descricao AS nome FROM goal WHERE id IN (${lista})`,
            )
          : tx.execute(
              sql`SELECT id, nome FROM protocol WHERE id IN (${lista})`,
            ))) as unknown as NameRow[];
      rows.forEach((r) => destino.set(r.id, r.nome));
    };
    await resolverNomes(
      "patient",
      faltam(
        alertasCessados.map((a) => a.patient_id),
        patientNames,
      ),
      patientNames,
    );
    await resolverNomes(
      "goal",
      faltam(
        alertasCessados.map((a) => a.goal_id),
        goalNames,
      ),
      goalNames,
    );
    await resolverNomes(
      "protocol",
      faltam(
        alertasCessados.map((a) => a.protocol_id),
        protocolNames,
      ),
      protocolNames,
    );

    for (const alert of alertasCessados) {
      {
        const det = (
          typeof alert.detalhe === "string"
            ? JSON.parse(alert.detalhe)
            : alert.detalhe
        ) as DetalheEstagnacao | DetalheFaltas;

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
