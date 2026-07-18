import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000d1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0d1";
const U_T1_A = "00000000-0000-0000-0000-0000000071d1";
const PAC_A1 = "00000000-0000-0000-0000-00000000acd1";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const base = {
  patientId: PAC_A1,
  terapeutaId: U_T1_A,
  disciplina: "aba",
  diaSemana: 1,
  horaInicio: "09:00",
  duracaoMin: 60,
  semanaVisivelISO: "2026-07-13",
  hojeISO: "2026-07-13",
};

let owner: ReturnType<typeof postgres>;
let criarRegra: typeof import("@/app/(app)/agenda/queries").criarRegra;
let ConflitoError: typeof import("@/app/(app)/agenda/queries").ConflitoError;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("criarRegra", () => {
  beforeAll(async () => {
    ({ criarRegra, ConflitoError } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (criar-regra)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.criarregra@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.criarregra@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  beforeEach(async () => {
    await owner`TRUNCATE agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE patient CASCADE`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Ana')`;
  });

  test("grava só agendamento_recorrente (0 sessions) com vigencia C7", async () => {
    const { id } = await criarRegra(ctxCoordA, base);
    const [regra] = await owner`SELECT vigencia_inicio::text AS vigencia_inicio FROM agendamento_recorrente WHERE id = ${id}`;
    expect(regra?.vigencia_inicio).toBe("2026-07-13");
    const sess = await owner`SELECT id FROM session`;
    expect(sess).toHaveLength(0); // C1
  });

  test("colisão de horário no mesmo terapeuta lança ConflitoError (C2/C5)", async () => {
    await criarRegra(ctxCoordA, base);
    await expect(criarRegra(ctxCoordA, { ...base, horaInicio: "09:30" })).rejects.toBeInstanceOf(
      ConflitoError,
    );
  });
});
