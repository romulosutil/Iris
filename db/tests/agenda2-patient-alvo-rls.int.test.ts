import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000a2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0a1";
const U_T1_A = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC_A1
const U_T2_A = "00000000-0000-0000-0000-0000000072a1"; // fora da equipe
const U_COORD_B = "00000000-0000-0000-0000-00000000c0a2";
const PAC_A1 = "00000000-0000-0000-0000-00000000aca1";
const PAC_B1 = "00000000-0000-0000-0000-00000000aca2";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const ctxT1A = { clinicId: CLINIC_A, userId: U_T1_A, role: "terapeuta" } as const;
const ctxT2A = { clinicId: CLINIC_A, userId: U_T2_A, role: "terapeuta" } as const;
const ctxCoordB = { clinicId: CLINIC_B, userId: U_COORD_B, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Agenda 2.0 · RLS de patient_alvo_disciplina", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      patient_alvo_disciplina RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (alvo)', false), (${CLINIC_B}, 'Clínica B (alvo)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.alvo@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.alvo@t.com'),
      (${U_T2_A}, 'T2 A', 't2.a.alvo@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.alvo@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'aba', 'terapeuta_referencia')`;
  });
  afterAll(async () => { await owner?.end(); await appSql?.end(); });

  test("coordenador insere alvo do próprio paciente e lê", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx.insert(schema.patientAlvoDisciplina).values({
        clinicId: CLINIC_A, patientId: PAC_A1, disciplina: "aba",
        horasAlvoSemana: "12.0", vigenciaInicio: "2026-07-01",
      }).returning({ id: schema.patientAlvoDisciplina.id }));
    expect(row?.id).toBeTruthy();
    const lidas = await withTenant(ctxCoordA, (tx) =>
      tx.select().from(schema.patientAlvoDisciplina));
    expect(lidas.length).toBe(1);
  });

  test("terapeuta da equipe lê o alvo do paciente", async () => {
    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.patientAlvoDisciplina));
    expect(lidas.length).toBe(1);
  });

  test("terapeuta fora da equipe NÃO lê", async () => {
    const lidas = await withTenant(ctxT2A, (tx) =>
      tx.select().from(schema.patientAlvoDisciplina));
    expect(lidas.length).toBe(0);
  });

  test("cross-tenant: coordenador da clínica B NÃO lê alvo da A", async () => {
    const lidas = await withTenant(ctxCoordB, (tx) =>
      tx.select().from(schema.patientAlvoDisciplina));
    expect(lidas.length).toBe(0);
  });

  test("IDOR: coordenador B NÃO insere alvo p/ paciente da clínica A", async () => {
    await expect(
      withTenant(ctxCoordB, (tx) =>
        tx.insert(schema.patientAlvoDisciplina).values({
          clinicId: CLINIC_B, patientId: PAC_A1, disciplina: "aba",
          horasAlvoSemana: "4.0", vigenciaInicio: "2026-07-01",
        })),
    ).rejects.toThrow(); // FK composta (PAC_A1, CLINIC_B) inexistente + WITH CHECK
  });

  test("terapeuta NÃO insere alvo (ato administrativo)", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.patientAlvoDisciplina).values({
          clinicId: CLINIC_A, patientId: PAC_A1, disciplina: "fono",
          horasAlvoSemana: "2.0", vigenciaInicio: "2026-07-01",
        })),
    ).rejects.toThrow();
  });
});
