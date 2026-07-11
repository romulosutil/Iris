import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1";
const U_T2 = "00000000-0000-0000-0000-0000000072a1";
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PROTO = "00000000-0000-0000-0000-00000070c0a1";
const SESS = "00000000-0000-0000-0000-00000005e1a1"; // terapeuta = U_T1
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let capturarDiario: typeof import("./actions").capturarDiario;
let corrigirEscopoProtocolo: typeof import("./actions").corrigirEscopoProtocolo;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("diário · captura", () => {
  beforeAll(async () => {
    ({ capturarDiario, corrigirEscopoProtocolo } = await import("./actions"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, protocol, session,
      session_note, session_protocol_scope, audio_capture, care_team_membership
      RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES ('aba_marcos_desenvolvimento', 'Marcos de desenvolvimento (ABA)') ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_T1}, ${CLINIC_A}, 'terapeuta'), (${U_T2}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P')`;
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROTO}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado)
      VALUES (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'presente')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'ABA')`;
  });
  afterAll(async () => { await owner?.end(); await appSql?.end(); });

  test("terapeuta dono grava captura rápida", async () => {
    const r = await capturarDiario(ctxT1, { sessionId: SESS, texto: "Pediu água apontando" });
    expect(r.error).toBeUndefined();
    expect(r.id).toBeTruthy();
  });

  test("terapeuta que não é dono da sessão é barrado", async () => {
    const r = await capturarDiario(ctxT2, { sessionId: SESS, texto: "indevido" });
    expect(r.error).toBeTruthy(); // RLS WITH CHECK bloqueia
  });

  test("corrigir escopo grava protocolo com origem ajustada", async () => {
    const r = await corrigirEscopoProtocolo(ctxT1, { sessionId: SESS, protocolIds: [PROTO] });
    expect(r.error).toBeUndefined();
    const rows = await owner`SELECT origem, ajustado_por FROM session_protocol_scope WHERE session_id = ${SESS}`;
    expect(rows[0]!.origem).toBe("ajustado_manualmente");
    expect(rows[0]!.ajustado_por).toBe(U_T1);
  });
});
