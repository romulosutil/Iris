/**
 * Integração — RLS das tabelas globais (Fase 1b). Prova o item que 4 rodadas
 * Jules deixaram diferido: app_role não toca auth_*; vê só identidade da
 * clínica ativa; iris_auth (bootstrap) vê tudo; sem recursão de policy.
 * Requer DATABASE_URL (app_role), AUTH_DATABASE_URL (iris_auth),
 * MIGRATION_DATABASE_URL (superuser). Auto-skip sem eles.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant } from "../../src/db/rls";
import { careTeamMembership, appUser, userRole, clinic } from "../../src/db/schema";
import { sql as appSql, authSql, authDb } from "../../src/db/client";

const hasDb =
  !!process.env.DATABASE_URL &&
  !!process.env.AUTH_DATABASE_URL &&
  !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002"; // equipe de P1
const U_EXT = "a0000000-0000-0000-0000-000000000006"; // só clínica B
const P2 = "b0000000-0000-0000-0000-000000000002"; // clínica A

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("RLS tabelas globais — Fase 1b", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test'),
      (${U_EXT}, 'Ext', 'ext@b.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA}, ${CLINIC_A}, 'terapeuta'),
      (${U_EXT}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${P2}, ${CLINIC_A}, 'P2')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
    await authSql.end();
  });

  test("app_role NÃO lê auth_session (revogado)", async () => {
    await expect(appSql`SELECT 1 FROM auth_session LIMIT 1`).rejects.toThrow();
  });

  test("app_role vê só app_user/user_role/clinic da clínica ativa", async () => {
    const users = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ id: appUser.id }).from(appUser),
    );
    const ids = users.map((u) => u.id).sort();
    // U_EXT (só clínica B) não aparece; U_COORD e U_TERA (clínica A) aparecem.
    expect(ids).toEqual([U_COORD, U_TERA].sort());
    expect(ids).not.toContain(U_EXT);

    const clinicas = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ id: clinic.id }).from(clinic),
    );
    expect(clinicas.map((c) => c.id)).toEqual([CLINIC_A]);

    const papeis = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select({ cid: userRole.clinicId }).from(userRole),
    );
    expect(papeis.every((p) => p.cid === CLINIC_A)).toBe(true);
  });

  test("iris_auth (bootstrap) lê user_role de qualquer clínica do usuário", async () => {
    const rows = await authDb
      .select({ cid: userRole.clinicId })
      .from(userRole);
    const clinicas = new Set(rows.map((r) => r.cid));
    expect(clinicas.has(CLINIC_A)).toBe(true);
    expect(clinicas.has(CLINIC_B)).toBe(true); // vê além da clínica ativa
  });

  test("não-recursão: ctm_write (chama app_user_in_clinic) funciona com RLS nova", async () => {
    // app_user_in_clinic é SECURITY DEFINER → não recursar na RLS de user_role.
    await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) =>
        db.insert(careTeamMembership).values({
          patientId: P2,
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
        }),
    );
    const equipe = await withTenant(
      { role: "coordenador", userId: U_COORD, clinicId: CLINIC_A },
      (db) => db.select().from(careTeamMembership),
    );
    expect(equipe.map((m) => m.userId)).toContain(U_TERA);
  });
});
