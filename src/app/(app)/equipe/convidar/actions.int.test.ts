import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
const { convidarUsuario } = await import("./actions");
const { authDb, authSql, sql: appSql } = await import("@/db/client");
const { userRole, appUser } = await import("@/db/schema");

// Convite escreve via authDb (iris_auth) → exige AUTH_DATABASE_URL além dos demais.
const hasDb =
  !!process.env.DATABASE_URL &&
  !!process.env.AUTH_DATABASE_URL &&
  !!process.env.MIGRATION_DATABASE_URL;
const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!hasDb)("convidarUsuario", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, auth_account RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_ADMIN}, 'Admin', 'admin@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao')`;
  });
  afterAll(async () => {
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  const ctxCoord = {
    clinicId: CLINIC_A,
    userId: U_COORD,
    role: "coordenador",
  } as const;
  const ctxAdmin = {
    clinicId: CLINIC_A,
    userId: U_ADMIN,
    role: "admin_recepcao",
  } as const;

  test("admin_recepcao NÃO pode convidar (requireRole bloqueia)", async () => {
    await expect(
      convidarUsuario(
        ctxAdmin,
        form({ nome: "X", email: "x@a.test", papel: "terapeuta" }),
      ),
    ).rejects.toThrow(/Acesso negado/);
  });

  test("coordenador não pode convidar outro coordenador por esta tela", async () => {
    const result = await convidarUsuario(
      ctxCoord,
      form({ nome: "X", email: "x@a.test", papel: "coordenador" }),
    );
    expect(result.error).toMatch(/terapeuta ou recepção/);
  });

  test("coordenador convida terapeuta com sucesso e recebe senha temporária", async () => {
    const result = await convidarUsuario(
      ctxCoord,
      form({ nome: "Nova Tera", email: "novatera@a.test", papel: "terapeuta" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.senhaTemporaria).toBeTruthy();
    const [criado] = await authDb
      .select()
      .from(userRole)
      .innerJoin(appUser, eq(userRole.userId, appUser.id))
      .where(eq(appUser.email, "novatera@a.test"));
    expect(criado).toBeDefined();
  });
});
