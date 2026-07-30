import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000b1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0b1";
const U_T1_A = "00000000-0000-0000-0000-0000000071b1"; // terapeuta da clínica A (na equipe de PAC_A1)
const U_T2_A = "00000000-0000-0000-0000-0000000072b1"; // outro terapeuta da A (fora da equipe)
const U_COORD_B = "00000000-0000-0000-0000-00000000c0b2";
const PAC_A1 = "00000000-0000-0000-0000-00000000acb1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acb2";

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
const ctxT2A = {
  clinicId: CLINIC_A,
  userId: U_T2_A,
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

describe.skipIf(!hasDb)("Agenda 2.0 · RLS de janela_trabalho", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      janela_trabalho RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (janela)', false), (${CLINIC_B}, 'Clínica B (janela)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.janela@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.janela@t.com'),
      (${U_T2_A}, 'T2 A', 't2.a.janela@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.janela@t.com')`;
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
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("coordenador insere janela e lê", async () => {
    const [row] = await withTenant(ctxCoordA, (tx) =>
      tx
        .insert(schema.janelaTrabalho)
        .values({
          clinicId: CLINIC_A,
          terapeutaId: U_T1_A,
          diaSemana: 1,
          horaInicio: "08:00",
          horaFim: "12:00",
        })
        .returning({ id: schema.janelaTrabalho.id }),
    );
    expect(row?.id).toBeTruthy();
    const lidas = await withTenant(ctxCoordA, (tx) =>
      tx.select().from(schema.janelaTrabalho),
    );
    expect(lidas.length).toBe(1);
  });

  test("terapeuta da clínica lê a grade (calendário compartilhado)", async () => {
    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.janelaTrabalho),
    );
    expect(lidas.length).toBe(1);
  });

  test("outro terapeuta da mesma clínica também lê a grade compartilhada", async () => {
    const lidas = await withTenant(ctxT2A, (tx) =>
      tx.select().from(schema.janelaTrabalho),
    );
    expect(lidas.length).toBe(1);
  });

  test("cross-tenant: coordenador B NÃO lê janela da A", async () => {
    const lidas = await withTenant(ctxCoordB, (tx) =>
      tx.select().from(schema.janelaTrabalho),
    );
    expect(lidas.length).toBe(0);
  });

  test("IDOR: coordenador B NÃO insere janela p/ terapeuta da A", async () => {
    await expect(
      withTenant(ctxCoordB, (tx) =>
        tx.insert(schema.janelaTrabalho).values({
          clinicId: CLINIC_B,
          terapeutaId: U_T1_A,
          diaSemana: 1,
          horaInicio: "08:00",
          horaFim: "12:00",
        }),
      ),
    ).rejects.toThrow(); // app_user_in_clinic(terapeuta A) falha sob clínica B
  });

  test("terapeuta NÃO insere janela (só coordenação configura)", async () => {
    await expect(
      withTenant(ctxT1A, (tx) =>
        tx.insert(schema.janelaTrabalho).values({
          clinicId: CLINIC_A,
          terapeutaId: U_T1_A,
          diaSemana: 2,
          horaInicio: "13:00",
          horaFim: "17:00",
        }),
      ),
    ).rejects.toThrow();
  });

  test("check de faixa: hora_fim <= hora_inicio é barrada", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.janelaTrabalho).values({
          clinicId: CLINIC_A,
          terapeutaId: U_T1_A,
          diaSemana: 3,
          horaInicio: "12:00",
          horaFim: "12:00",
        }),
      ),
    ).rejects.toThrow(); // constraint janela_trabalho_faixa
  });
});
