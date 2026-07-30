/**
 * Fase 6.2b — isolamento da credencial MFA. O segredo TOTP e os códigos de
 * backup (tabela two_factor) são credenciais: só o papel de auth (iris_auth) os
 * acessa; o papel de tenant (app_role) NUNCA. Roda com `pnpm test:rls`.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("fase6.2b · isolamento da credencial MFA", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE two_factor, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_A}, 'Coord A', 'coord-a@fase6-mfa.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner!`INSERT INTO two_factor (user_id, secret, backup_codes) VALUES (${U_COORD_A}, 'segredo-cifrado', 'backups-cifrados')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("app_user ganhou two_factor_enabled default false", async () => {
    const rows =
      await owner!`SELECT two_factor_enabled FROM app_user WHERE id = ${U_COORD_A}`;
    expect(rows[0]!.two_factor_enabled).toBe(false);
  });

  test("app_role NÃO lê o segredo TOTP (credencial isolada do tenant)", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`SELECT secret FROM two_factor`),
      ),
    ).rejects.toThrow();
  });

  test("app_role NÃO escreve em two_factor", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(
          sql`UPDATE two_factor SET secret = 'x' WHERE user_id = ${U_COORD_A}::uuid`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("owner (bootstrap/auth) enxerga a credencial", async () => {
    const rows =
      await owner!`SELECT secret FROM two_factor WHERE user_id = ${U_COORD_A}`;
    expect(rows).toHaveLength(1);
  });
});
