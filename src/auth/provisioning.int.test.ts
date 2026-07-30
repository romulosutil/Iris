/**
 * Integração — provisionUser (Fase 1b, A6). Upsert por email: um email que já
 * existe recebe novo user_role, sem duplicar app_user.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// provisioning.ts importa "server-only" (pacote inexistente fora do bundler
// do Next) — stub basta para o módulo carregar sob vitest (mesmo padrão de
// tenant.int.test.ts).
vi.mock("server-only", () => ({}));

const { provisionUser } = await import("./provisioning");
const { authDb, authSql, sql: appSql } = await import("@/db/client");
const { appUser, userRole } = await import("@/db/schema");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("provisionUser — A6 upsert por email", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, auth_account RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
  });
  afterAll(async () => {
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("cria user novo + user_role", async () => {
    const { userId } = await provisionUser({
      email: "novo@x.test",
      nome: "Novo",
      senha: "senha-forte-123",
      clinicId: CLINIC_A,
      papel: "coordenador",
    });
    const users = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.email, "novo@x.test"));
    expect(users).toHaveLength(1);
    expect(users[0]!.id).toBe(userId);
    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, userId));
    expect(papeis).toHaveLength(1);
  });

  test("email existente NÃO duplica app_user; anexa novo user_role", async () => {
    const { userId } = await provisionUser({
      email: "novo@x.test",
      nome: "Novo",
      senha: "ignorada",
      clinicId: CLINIC_B,
      papel: "terapeuta",
    });
    const users = await authDb
      .select()
      .from(appUser)
      .where(eq(appUser.email, "novo@x.test"));
    expect(users).toHaveLength(1); // ainda 1 app_user
    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, userId));
    expect(papeis.map((p) => p.clinicId).sort()).toEqual(
      [CLINIC_A, CLINIC_B].sort(),
    );
  });
});
