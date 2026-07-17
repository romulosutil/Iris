import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000f1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000f2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0f1";
const U_T1_A = "00000000-0000-0000-0000-0000000071f1"; // terapeuta da A (na equipe de PAC_A1)
const U_COORD_B = "00000000-0000-0000-0000-00000000c0f2";
const PAC_A1 = "00000000-0000-0000-0000-00000000acf1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acf2";
const REC_A1 = "00000000-0000-0000-0000-0000000ec0f1"; // agendamento_recorrente da A
const SESS_T1 = "00000000-0000-0000-0000-000000005ef1"; // sessão agendada do T1
const SESS_B = "00000000-0000-0000-0000-000000005ef2"; // sessão da clínica B

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const ctxT1A = { clinicId: CLINIC_A, userId: U_T1_A, role: "terapeuta" } as const;
const ctxCoordB = { clinicId: CLINIC_B, userId: U_COORD_B, role: "coordenador" } as const;

const AGENDA_MAT = new Date("2026-07-20T13:00:00Z");

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Agenda 2.0 · RLS de session enriquecida", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (session)', false), (${CLINIC_B}, 'Clínica B (session)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.sess@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.sess@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.sess@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'aba', 'terapeuta_referencia')`;
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio)
      VALUES (${REC_A1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, 'aba', 1, '13:00', 60, '2026-07-01')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado)
      VALUES (${SESS_T1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, '2026-07-21T13:00:00Z', 'agendada')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado)
      VALUES (${SESS_B}, ${CLINIC_B}, ${PAC_B1}, ${U_COORD_B}, '2026-07-21T13:00:00Z', 'agendada')`;
  });
  afterAll(async () => { await owner?.end(); await appSql?.end(); });

  test("materialização idempotente: (recorrenteId, agendadaPara) não duplica", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CLINIC_A, patientId: PAC_A1, terapeutaId: U_T1_A,
        agendadaPara: AGENDA_MAT, recorrenteId: REC_A1, disciplina: "aba", duracaoMin: 60,
      }).returning({ id: schema.session.id }));
    expect(row?.id).toBeTruthy();
    await expect(withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CLINIC_A, patientId: PAC_A1, terapeutaId: U_T1_A,
        agendadaPara: AGENDA_MAT, recorrenteId: REC_A1, disciplina: "aba", duracaoMin: 60,
      }))).rejects.toThrow(); // uq_session_recorrente_agendada
  });

  test("terapeuta marca a própria sessão como realizada", async () => {
    const upd = await withTenant(ctxT1A, (tx) =>
      tx.update(schema.session).set({ estado: "realizada" })
        .where(eq(schema.session.id, SESS_T1))
        .returning({ id: schema.session.id }));
    expect(upd.length).toBe(1);
  });

  test("avulsa: insert com recorrenteId null e tipo=avaliacao", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CLINIC_A, patientId: PAC_A1, terapeutaId: U_T1_A,
        agendadaPara: new Date("2026-07-22T09:00:00Z"), tipo: "avaliacao", duracaoMin: 90,
      }).returning({ id: schema.session.id, tipo: schema.session.tipo }));
    expect(row?.tipo).toBe("avaliacao");
  });

  test("IDOR: coordenador B NÃO seta atendidoPorId = terapeuta da A", async () => {
    await expect(withTenant(ctxCoordB, (tx) =>
      tx.update(schema.session).set({ atendidoPorId: U_T1_A })
        .where(eq(schema.session.id, SESS_B)))).rejects.toThrow(); // app_user_in_clinic(T1 A) sob clínica B (0034)
  });
});
