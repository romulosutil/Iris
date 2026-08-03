import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000d1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000d2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0d1";
const U_T1_A = "00000000-0000-0000-0000-0000000071d1"; // terapeuta da A (na equipe de PAC_A1)
const U_COORD_B = "00000000-0000-0000-0000-00000000c0d2";
const PAC_A1 = "00000000-0000-0000-0000-00000000acd1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acd2";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxT1A = {
  clinicId: CLINIC_A,
  userId: U_T1_A,
  role: "terapeuta",
} as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Agenda 2.0 · RLS de bloqueio", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (bloqueio)', false), (${CLINIC_B}, 'Clínica B (bloqueio)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.bloq@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.bloq@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.bloq@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'aba', 'terapeuta_referencia')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("coordenador cria bloqueio de clínica (alvos null) e lê", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx
        .insert(schema.bloqueio)
        .values({
          clinicId: CLINIC_A,
          escopo: "clinica",
          dataInicio: "2026-12-24",
          dataFim: "2026-12-26",
          motivo: "recesso de fim de ano",
        })
        .returning({ id: schema.bloqueio.id }),
    );
    expect(row?.id).toBeTruthy();
    const lidos = await withTenant(ctxCoordA, (tx) =>
      tx.select().from(schema.bloqueio),
    );
    expect(lidos.length).toBe(1);
  });

  test("coordenador cria bloqueio de paciente (viagem)", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx
        .insert(schema.bloqueio)
        .values({
          clinicId: CLINIC_A,
          escopo: "paciente",
          patientId: PAC_A1,
          dataInicio: "2026-07-20",
          dataFim: "2026-08-10",
          motivo: "viagem em família",
        })
        .returning({ id: schema.bloqueio.id }),
    );
    expect(row?.id).toBeTruthy();
  });

  test("check barra escopo=paciente sem patient_id", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.bloqueio).values({
          clinicId: CLINIC_A,
          escopo: "paciente",
          dataInicio: "2026-07-20",
          dataFim: "2026-07-25",
          motivo: "viagem",
        }),
      ),
    ).rejects.toThrow(); // constraint bloqueio_escopo_alvo
  });

  test("check barra escopo=clinica com terapeuta_id preenchido", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.bloqueio).values({
          clinicId: CLINIC_A,
          escopo: "clinica",
          terapeutaId: U_T1_A,
          dataInicio: "2026-07-20",
          dataFim: "2026-07-25",
          motivo: "x",
        }),
      ),
    ).rejects.toThrow(); // constraint bloqueio_escopo_alvo
  });

  test("cross-tenant: coordenador B NÃO lê bloqueio da A", async () => {
    const lidos = await withTenant(ctxCoordB, (tx) =>
      tx.select().from(schema.bloqueio),
    );
    expect(lidos.length).toBe(0);
  });

  test("IDOR: coordenador B NÃO cria bloqueio p/ paciente da A", async () => {
    await expect(
      withTenant(ctxCoordB, (tx) =>
        tx.insert(schema.bloqueio).values({
          clinicId: CLINIC_B,
          escopo: "paciente",
          patientId: PAC_A1,
          dataInicio: "2026-07-20",
          dataFim: "2026-07-25",
          motivo: "x",
        }),
      ),
    ).rejects.toThrow(); // FK composta (PAC_A1, CLINIC_B) inexistente
  });

  test("terapeuta NÃO cria bloqueio (só coordenação)", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.bloqueio).values({
          clinicId: CLINIC_A,
          escopo: "clinica",
          dataInicio: "2026-09-07",
          dataFim: "2026-09-07",
          motivo: "feriado",
        }),
      ),
    ).rejects.toThrow();
  });
});
