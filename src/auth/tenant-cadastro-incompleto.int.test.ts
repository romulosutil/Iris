/**
 * Integração — Task 10. Cobre o caso em que o provisionamento de cadastro
 * self-service (`src/auth/cadastro.ts`) morre entre criar o `app_user` e criar
 * a clínica/`user_role` (não é atômico). Hoje `resolveTenant` devolve
 * `no_access` para esse usuário — beco sem saída, com o e-mail já queimado.
 * Depois do fix deve devolver `cadastro_incompleto` com o `userId`, sem
 * conceder acesso a nada.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { resolveTenant } = await import("./tenant");
const { authSql, sql: appSql } = await import("@/db/client");
const { auth } = await import("@/auth/auth");

const U_SEM_VINCULO = "a0000000-0000-0000-0000-000000000012"; // app_user sem user_role

let owner: ReturnType<typeof postgres>;
const H = new Headers();

function mockSession(userId: string | null) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    userId ? ({ user: { id: userId } } as never) : null,
  );
}

describe.skipIf(!hasDb)("resolveTenant — cadastro incompleto", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_SEM_VINCULO}, 'Sem Vinculo', 'sem-vinculo@x.test')`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("app_user sem nenhum user_role → cadastro_incompleto com userId", async () => {
    mockSession(U_SEM_VINCULO);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("cadastro_incompleto");
    if (r.status === "cadastro_incompleto") {
      expect(r.userId).toBe(U_SEM_VINCULO);
    }
  });
});
