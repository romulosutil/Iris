import { describe, expect, test, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { withTenant } from "@/db/rls";
import { sql as appSql } from "@/db/client";
import {
  carregarTimeline,
  carregarSnapshotAsOf,
  carregarDeltaSessao,
  carregarComparacao,
  carregarEvidenciasPorTrecho,
} from "./queries";

vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0fa";
const U_T1_A = "00000000-0000-0000-0000-0000000071fa";
const PAC_A1 = "00000000-0000-0000-0000-00000000acfa";
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let PROTOCOL_ID: string;
let MARCO_ID: string;
let GOAL_ID: string;
let SESS_A1_ID: string;
let SESS_A2_ID: string;

describe.skipIf(!hasDb)("queries.ts (timeline integrated tests)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, extraction, evidence, evidence_revision, evidence_query,
      protocol, milestone, goal, goal_candidacy, milestone_candidacy, session_snapshot,
      patient_protocol
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica A (timeline queries)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.time@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.time@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (timeline)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    const [protocolo] = await owner`INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'VB-MAPP (timeline)', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
    PROTOCOL_ID = protocolo!.id as string;

    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${PAC_A1}, ${PROTOCOL_ID}, ${U_COORD_A})`;

    const [milestoneRow] = await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando nível 1', 'marco_simples', ${owner.json({})})
      RETURNING id`;
    MARCO_ID = milestoneRow!.id as string;

    const [goalRow] = await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Pedir água de forma independente', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD_A})
      RETURNING id`;
    GOAL_ID = goalRow!.id as string;

    // Sessão 1 e 2
    SESS_A1_ID = crypto.randomUUID();
    SESS_A2_ID = crypto.randomUUID();
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${SESS_A1_ID}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-01 10:00:00Z', 'realizada', 1, 'aba'),
      (${SESS_A2_ID}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-02 10:00:00Z', 'realizada', 2, 'aba')`;

    // Snapshot Sessão 1
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${PAC_A1}, 1,
        ${owner.json({ [MARCO_ID]: { nivel_ajuda_recente: 2, contagem: 3, is_candidata: false } })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 2 }, rotulo: "evolucao" } } })}
      )`;

    // Snapshot Sessão 2
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
      (${PAC_A1}, 2,
        ${owner.json({
          [MARCO_ID]: { nivel_ajuda_recente: 0, contagem: 5, is_candidata: true },
          [GOAL_ID]: { contagem: 4, is_candidata: true }
        })},
        ${owner.json({ [GOAL_ID]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 0 }, rotulo: "evolucao" } } })}
      )`;

    // Evidência na sessão 2 para testar o drill-down
    const [ext] = await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload)
      VALUES (${SESS_A2_ID}, ${CLINIC_A}, 'aprovada', 'evidencia', 'falou agua sozinho', 'alta', ${owner.json({})}) RETURNING id`;
    
    await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
      VALUES (${ext!.id}, ${PAC_A1}, ${SESS_A2_ID}, 2, 0, ${PROTOCOL_ID}, ${GOAL_ID}, ${MARCO_ID}, ${owner.json({ descricao: "pediu agua independente", polaridade: "positiva", nivel_ajuda: "independente" })}, ${U_T1_A})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("carregarTimeline calcula o espectro e retorna metadados ativos", async () => {
    const res = await carregarTimeline(ctxCoordA, PAC_A1);
    expect(res).toBeTruthy();
    expect(res!.snapshots).toHaveLength(2);
    
    // sessão 2 deve vir primeiro (orderBy sessionNumero desc)
    const snap2 = res!.snapshots[0]!;
    expect(snap2.sessionNumero).toBe(2);
    expect(snap2.espectro).toHaveLength(6);
    
    const expressiva = snap2.espectro.find((e) => e.eixo === "comunicacao_expressiva");
    // milestone-1 (mando): nivel 0 de 4 -> 100%
    // goal-1 (ABA -> fallback): is_candidata=true -> 100%
    // Média = 100%
    expect(expressiva?.valor).toBe(100);

    expect(res!.metasAtivas).toHaveLength(1);
    expect(res!.metasAtivas[0]!.id).toBe(GOAL_ID);
    expect(res!.protocolosAtivos).toHaveLength(1);
    expect(res!.protocolosAtivos[0]!.id).toBe(PROTOCOL_ID);
  });

  test("carregarDeltaSessao calcula delta comparando com sessão anterior", async () => {
    const res = await carregarDeltaSessao(ctxCoordA, PAC_A1, 2);
    expect(res).toBeTruthy();
    expect(res.delta.evidenciasNovas).toBe(6); // B mando contagem 5 - A contagem 3 = +2; B goal contagem 4 (novo no snap, não tinha em A) = +4. Total = 6.
    expect(res.delta.metasCandidatasNovas).toBe(2); // MARCO_ID virou cand + GOAL_ID virou cand

    const itemMarco = res.delta.itens.find((i) => i.id === MARCO_ID);
    expect(itemMarco?.tipo).toBe("evolucao"); // 2 (gestual) -> 0 (independente)
    expect(itemMarco?.virouCandidata).toBe(true);

    expect(res.metas).toHaveLength(1);
    expect(res.milestones).toHaveLength(1);
  });

  test("carregarComparacao calcula delta de comparação entre 2 pontos e retorna guard G7", async () => {
    // Passamos invertido (2, 1) para provar que a API reordena e garante determinismo cronológico
    const res = await carregarComparacao(ctxCoordA, PAC_A1, 2, 1);
    expect(res).toBeTruthy();
    expect(res!.protocoloMudou).toBe(false); // mesmo protocolo (timeline)
    expect(res!.delta.evidenciasNovas).toBe(6);
    expect(res!.snapAntigo.sessionNumero).toBe(1);
    expect(res!.snapNovo.sessionNumero).toBe(2);
  });

  test("carregarEvidenciasPorTrecho busca evidências e limita quantidade", async () => {
    const res = await carregarEvidenciasPorTrecho(ctxCoordA, PAC_A1, GOAL_ID, 1, 2);
    expect(res).toHaveLength(1);
    expect(res[0]!.descricao).toBe("pediu agua independente");
    expect(res[0]!.nivelAjuda).toBe("independente");
  });
});
