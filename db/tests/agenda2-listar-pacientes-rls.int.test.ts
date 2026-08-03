import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c001";
const PAC_A1 = "00000000-0000-0000-0000-0000000a0001";
const PAC_A2 = "00000000-0000-0000-0000-0000000a0002";
const PAC_B1 = "00000000-0000-0000-0000-0000000b0001";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let listarPacientes: typeof import("@/app/(app)/agenda/queries").listarPacientes;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("listarPacientes (RLS/IDOR)", () => {
  beforeAll(async () => {
    ({ listarPacientes } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (listar pacientes)', false),
      (${CLINIC_B}, 'Clínica B (listar pacientes)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.listarpac@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Ana Alfa'),
      (${PAC_A2}, ${CLINIC_A}, 'Bruno Beta'),
      (${PAC_B1}, ${CLINIC_B}, 'Ana Outra Clinica')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("só retorna pacientes do tenant do ctx (isolamento)", async () => {
    const r = await listarPacientes(ctxA, "Ana");
    expect(r.map((p) => p.nome)).toEqual(["Ana Alfa"]); // não vaza a clínica B
  });

  test("filtra por termo case-insensitive", async () => {
    const r = await listarPacientes(ctxA, "bruno");
    expect(r).toHaveLength(1);
    expect(r[0]?.nome).toBe("Bruno Beta");
  });
});
