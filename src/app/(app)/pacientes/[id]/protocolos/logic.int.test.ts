import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_B = "00000000-0000-0000-0000-0000000ac1b1"; // outra clínica
const PAC_VAZIO = "00000000-0000-0000-0000-0000000ac2a1"; // sem protocolos/metas

const PROTO1 = "10000000-0000-0000-0000-000000000001";
const MILE1 = "20000000-0000-0000-0000-000000000001";
const G_DOMINADA = "30000000-0000-0000-0000-000000000001";
const G_ATIVA = "30000000-0000-0000-0000-000000000002";
const G_CANDIDATA = "30000000-0000-0000-0000-000000000003"; // ativa + candidacy IA
const G_RASCUNHO = "30000000-0000-0000-0000-000000000004"; // fora do denominador
const G_FONO = "30000000-0000-0000-0000-000000000005"; // sem mapeamento de marco
const SESS1 = "40000000-0000-0000-0000-000000000001";
const SESS2 = "40000000-0000-0000-0000-000000000002";
const EXT1 = "50000000-0000-0000-0000-000000000001";
const EXT2 = "50000000-0000-0000-0000-000000000002";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD,
  role: "coordenador",
} as const;

const CRITERIO = JSON.stringify({ tipo: "n_acertos_m_sessoes", n: 3, m: 3 });

let owner: ReturnType<typeof postgres>;
let Q: typeof import("./queries");
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("dashboard de protocolos · agregação e RLS", () => {
  beforeAll(async () => {
    Q = await import("./queries");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    // `protocol_familia_catalogo` NÃO entra no TRUNCATE: é dado de referência
    // da migração 0001 (guard db/tests/no-truncate-reference-data.test.ts, #222).
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      protocol, patient_protocol, milestone,
      goal, goal_milestone_mapping, goal_candidacy,
      session, extraction, evidence RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES (${U_COORD}, 'c@x.com', 'Coord')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'P'), (${PAC_VAZIO}, ${CLINIC_A}, 'PV'),
      (${PAC_B}, ${CLINIC_B}, 'PB')`;

    // Protocolo ativo do paciente A + marco.
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES ('vb-mapp', 'VB-MAPP') ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia)
      VALUES (${PROTO1}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'vb-mapp')`;
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${PAC}, ${PROTO1}, ${U_COORD})`;
    await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${MILE1}, ${PROTO1}, 'mando', 'Mando 1', 'marco_simples', '{}')`;

    // Metas: dominada (com candidacy — não pode contar duplo), ativa,
    // ativa+candidata IA, rascunho (fora do denominador), Fono sem marco.
    await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, disciplina, estado, criterio_dominio, criado_por) VALUES
      (${G_DOMINADA}, ${PAC}, ${CLINIC_A}, 'dominada', 'ABA', 'dominada', ${CRITERIO}, ${U_COORD}),
      (${G_ATIVA}, ${PAC}, ${CLINIC_A}, 'ativa', 'ABA', 'ativa', ${CRITERIO}, ${U_COORD}),
      (${G_CANDIDATA}, ${PAC}, ${CLINIC_A}, 'candidata', 'ABA', 'ativa', ${CRITERIO}, ${U_COORD}),
      (${G_RASCUNHO}, ${PAC}, ${CLINIC_A}, 'rascunho', 'ABA', 'rascunho', ${CRITERIO}, ${U_COORD}),
      (${G_FONO}, ${PAC}, ${CLINIC_A}, 'fono', 'Fono', 'ativa', ${CRITERIO}, ${U_COORD})`;
    await owner`INSERT INTO goal_milestone_mapping (goal_id, milestone_id) VALUES
      (${G_DOMINADA}, ${MILE1}), (${G_ATIVA}, ${MILE1}),
      (${G_CANDIDATA}, ${MILE1}), (${G_RASCUNHO}, ${MILE1})`;
    await owner`INSERT INTO goal_candidacy (goal_id, is_candidate_dominada) VALUES
      (${G_CANDIDATA}, true), (${G_DOMINADA}, true)`;

    // Evidências em 2 sessões: sessão 1 com 2, sessão 2 com 1.
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina, numero_sequencial_paciente) VALUES
      (${SESS1}, ${CLINIC_A}, ${PAC}, ${U_COORD}, '2026-08-01T10:00:00Z', 'ABA', 1),
      (${SESS2}, ${CLINIC_A}, ${PAC}, ${U_COORD}, '2026-08-08T10:00:00Z', 'ABA', 2)`;
    await owner`INSERT INTO extraction (id, session_id, clinic_id, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EXT1}, ${SESS1}, ${CLINIC_A}, 'evidencia', 't', 'alta', '{}'),
      (${EXT2}, ${SESS2}, ${CLINIC_A}, 'evidencia', 't', 'alta', '{}')`;
    await owner`INSERT INTO evidence (extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EXT1}, ${PAC}, ${SESS1}, 1, 0, '{}', ${U_COORD}),
      (${EXT1}, ${PAC}, ${SESS1}, 1, 1, '{}', ${U_COORD}),
      (${EXT2}, ${PAC}, ${SESS2}, 2, 0, '{}', ${U_COORD})`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("agrega por protocolo: rascunho fora, candidata IA conta uma vez", async () => {
    const r = await Q.getProtocolDashboardMetrics(ctxCoordA, PAC);
    expect(r).not.toBeNull();
    expect(r!.paciente.nome).toBe("P");
    expect(r!.protocolos).toHaveLength(1);
    // 3 metas contábeis (dominada, ativa, candidata); rascunho excluída;
    // candidacy da meta já dominada NÃO vira sugestão pendente.
    expect(r!.protocolos[0]).toMatchObject({
      protocoloNome: "VB-MAPP",
      totalMetas: 3,
      metasDominadas: 1,
      metasSugeridasIA: 1,
    });
  });

  test("visão por disciplina: Fono sem candidacy → metasSugeridasIA = 0", async () => {
    const r = await Q.getProtocolDashboardMetrics(ctxCoordA, PAC);
    const fono = r!.porDisciplina.find((d) => d.protocoloNome === "Fono");
    expect(fono).toMatchObject({
      totalMetas: 1,
      metasDominadas: 0,
      metasSugeridasIA: 0,
    });
    const aba = r!.porDisciplina.find((d) => d.protocoloNome === "ABA");
    expect(aba).toMatchObject({
      totalMetas: 3,
      metasDominadas: 1,
      metasSugeridasIA: 1,
    });
  });

  test("tendência cumulativa por sessionNumero", async () => {
    const r = await Q.getProtocolDashboardMetrics(ctxCoordA, PAC);
    expect(r!.tendencia).toHaveLength(2);
    expect(r!.tendencia[0]).toMatchObject({
      sessaoNumero: 1,
      evidenciasAcumuladas: 2,
      conquistasNoDia: 2,
    });
    expect(r!.tendencia[1]).toMatchObject({
      sessaoNumero: 2,
      evidenciasAcumuladas: 3,
      conquistasNoDia: 1,
    });
  });

  test("paciente de outra clínica → null (isolamento RLS)", async () => {
    const r = await Q.getProtocolDashboardMetrics(ctxCoordB, PAC);
    expect(r).toBeNull();
  });

  test("paciente sem protocolos/metas → arrays vazios (empty state)", async () => {
    const r = await Q.getProtocolDashboardMetrics(ctxCoordA, PAC_VAZIO);
    expect(r).not.toBeNull();
    expect(r!.protocolos).toEqual([]);
    expect(r!.porDisciplina).toEqual([]);
    expect(r!.tendencia).toEqual([]);
  });
});
