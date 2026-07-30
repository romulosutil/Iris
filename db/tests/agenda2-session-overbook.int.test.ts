import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CID_A = "00000000-0000-0000-0000-0000000000a7";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0a7";
const U_T1_A = "00000000-0000-0000-0000-0000000071a7";
const U_T2_A = "00000000-0000-0000-0000-0000000072a7";
const PAC_A1 = "00000000-0000-0000-0000-00000000aca7";
const PAC_A2 = "00000000-0000-0000-0000-00000000aca8";

const ctxCoordA = {
  clinicId: CID_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Agenda 2.0 · EXCLUDE anti-overbook em session", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CID_A}, 'Clínica A (overbook)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.over@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.over@t.com'),
      (${U_T2_A}, 'T2 A', 't2.a.over@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CID_A}, 'coordenador'),
      (${U_T1_A}, ${CID_A}, 'terapeuta'),
      (${U_T2_A}, ${CID_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CID_A}, 'Paciente A1'),
      (${PAC_A2}, ${CID_A}, 'Paciente A2')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("overbook do terapeuta é barrado no banco", async () => {
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CID_A,
        patientId: PAC_A1,
        terapeutaId: U_T1_A,
        agendadaPara: new Date("2026-07-20T13:00:00Z"),
        duracaoMin: 60,
        estado: "agendada",
        disciplina: "aba",
      }),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.session).values({
          clinicId: CID_A,
          patientId: PAC_A2,
          terapeutaId: U_T1_A,
          agendadaPara: new Date("2026-07-20T13:30:00Z"),
          duracaoMin: 60,
          estado: "agendada",
          disciplina: "aba",
        }),
      ),
    ).rejects.toThrow(); // session_no_overbook_terapeuta
  });

  test("overbook do paciente é barrado no banco", async () => {
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CID_A,
        patientId: PAC_A1,
        terapeutaId: U_T1_A,
        agendadaPara: new Date("2026-07-21T09:00:00Z"),
        duracaoMin: 60,
        estado: "agendada",
        disciplina: "aba",
      }),
    );
    // mesmo paciente, OUTRO terapeuta, horário sobreposto → constraint de paciente
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.session).values({
          clinicId: CID_A,
          patientId: PAC_A1,
          terapeutaId: U_T2_A,
          agendadaPara: new Date("2026-07-21T09:30:00Z"),
          duracaoMin: 60,
          estado: "agendada",
          disciplina: "aba",
        }),
      ),
    ).rejects.toThrow(); // session_no_overbook_paciente
  });

  test("sobreposição com sessão cancelada é permitida (WHERE só cobre agendada)", async () => {
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CID_A,
        patientId: PAC_A2,
        terapeutaId: U_T2_A,
        agendadaPara: new Date("2026-07-22T14:00:00Z"),
        duracaoMin: 60,
        estado: "cancelada",
        disciplina: "aba",
      }),
    );
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx
        .insert(schema.session)
        .values({
          clinicId: CID_A,
          patientId: PAC_A2,
          terapeutaId: U_T2_A,
          agendadaPara: new Date("2026-07-22T14:00:00Z"),
          duracaoMin: 60,
          estado: "agendada",
          disciplina: "aba",
        })
        .returning({ id: schema.session.id }),
    );
    expect(row?.id).toBeTruthy();
  });

  test("horários adjacentes não sobrepostos são permitidos (range meia-aberto)", async () => {
    await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.session).values({
        clinicId: CID_A,
        patientId: PAC_A1,
        terapeutaId: U_T2_A,
        agendadaPara: new Date("2026-07-23T10:00:00Z"),
        duracaoMin: 60,
        estado: "agendada",
        disciplina: "aba",
      }),
    );
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx
        .insert(schema.session)
        .values({
          clinicId: CID_A,
          patientId: PAC_A1,
          terapeutaId: U_T2_A,
          agendadaPara: new Date("2026-07-23T11:00:00Z"),
          duracaoMin: 60,
          estado: "agendada",
          disciplina: "aba",
        })
        .returning({ id: schema.session.id }),
    );
    expect(row?.id).toBeTruthy();
  });
});
