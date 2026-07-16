import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

// IDs fixos — namespace próprio desta suíte (evita colisão com o seed de
// db/tests/fase2-rls.int.test.ts, que também usa TRUNCATE ... CASCADE nas
// mesmas tabelas).
const CLINIC_A = "00000000-0000-0000-0000-0000000f0a01";
const U_COORD_A = "00000000-0000-0000-0000-0000000fc0a1";
const U_T1_A = "00000000-0000-0000-0000-0000000f71a1";
const PAC_A1 = "00000000-0000-0000-0000-0000000fac1a";
const PROTO_A = "00000000-0000-0000-0000-0000000f70a1";
const SESS_CAPTURA = "00000000-0000-0000-0000-0000000fe1a1"; // captura sem consolidada
const SESS_CONSOLIDADA = "00000000-0000-0000-0000-0000000fe1a2"; // captura + consolidada (não deve aparecer)
const SESS_EXTRACAO_PEND = "00000000-0000-0000-0000-0000000fe1a3";
const SESS_EXTRACAO_SUG = "00000000-0000-0000-0000-0000000fe1a4";
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxT1A = { clinicId: CLINIC_A, userId: U_T1_A, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let listarPendencias: typeof import("./queries").listarPendencias;

describe.skipIf(!hasDb)("Fila de pendências · queries", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    ({ listarPendencias } = await import("./queries"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      protocol, session, session_note, session_protocol_scope, audio_capture, extraction,
      goal, goal_milestone_mapping, milestone, goal_candidacy, milestone_candidacy
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica pendências', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord Pendências', 'coord.pend@t.com'),
      (${U_T1_A}, 'Terapeuta Pendências', 't1.pend@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente Pendências')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO_A}, ${CLINIC_A}, 'VB-MAPP demo', 'ABA', ${PROTOCOL_FAMILIA})`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS_CAPTURA}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada'),
      (${SESS_CONSOLIDADA}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada'),
      (${SESS_EXTRACAO_PEND}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada'),
      (${SESS_EXTRACAO_SUG}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada')`;

    // Sessão com captura_rapida SEM nota_consolidada → deve aparecer.
    await owner`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id) VALUES
      (${SESS_CAPTURA}, ${CLINIC_A}, 'captura_rapida', 'Pediu água e apontou', ${U_T1_A})`;

    // Sessão com captura_rapida + nota_consolidada → NÃO deve aparecer.
    await owner`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id) VALUES
      (${SESS_CONSOLIDADA}, ${CLINIC_A}, 'captura_rapida', 'Rascunho', ${U_T1_A}),
      (${SESS_CONSOLIDADA}, ${CLINIC_A}, 'nota_consolidada', 'Nota final consolidada', ${U_T1_A})`;

    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${SESS_EXTRACAO_PEND}, ${CLINIC_A}, 'pendente_reprocessamento', 'evidencia', 'trecho pendente', 'media', ${owner.json({ alvos: [] })})`;

    await owner`INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${SESS_EXTRACAO_SUG}, ${CLINIC_A}, 'sugerida', 'evidencia', 'trecho sugerido', 'alta', ${owner.json({ alvos: [] })})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("captura_rapida sem nota_consolidada aparece em capturasAConsolidar", async () => {
    const { capturasAConsolidar } = await listarPendencias(ctxT1A);
    expect(capturasAConsolidar.map((c) => c.sessionId)).toContain(SESS_CAPTURA);
    expect(capturasAConsolidar.map((c) => c.sessionId)).not.toContain(
      SESS_CONSOLIDADA,
    );
  });

  test("extração pendente_reprocessamento aparece em extracaoPendente", async () => {
    const { extracaoPendente } = await listarPendencias(ctxT1A);
    expect(extracaoPendente.map((e) => e.sessionId)).toContain(
      SESS_EXTRACAO_PEND,
    );
    expect(extracaoPendente.map((e) => e.sessionId)).not.toContain(
      SESS_EXTRACAO_SUG,
    );
  });

  test("extração sugerida (demo) aparece em sugestoesDemo", async () => {
    const { sugestoesDemo } = await listarPendencias(ctxT1A);
    expect(sugestoesDemo.map((s) => s.sessionId)).toContain(SESS_EXTRACAO_SUG);
    expect(sugestoesDemo.map((s) => s.sessionId)).not.toContain(
      SESS_EXTRACAO_PEND,
    );
  });

  test("total soma as 3 categorias", async () => {
    const r = await listarPendencias(ctxT1A);
    expect(r.total).toBe(
      r.capturasAConsolidar.length +
        r.extracaoPendente.length +
        r.sugestoesDemo.length,
    );
    expect(r.total).toBeGreaterThanOrEqual(3);
  });
});
