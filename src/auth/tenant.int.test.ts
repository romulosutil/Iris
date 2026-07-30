/**
 * Integração — resolveTenant (Fase 1b). Foca no invariante A1: cookie é
 * seleção, não concessão. Semeia user_role via superuser e chama resolveTenant
 * com uma sessão simulada (mockando auth.api.getSession).
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// tenant.ts importa "server-only" (pacote inexistente fora do bundler do Next)
// e next/headers|next/navigation (cujas funções só funcionam dentro de uma
// request do Next). resolveTenant() não chama cookies()/headers()/redirect()
// — só getTenantContext() chama — então stubs bastam para o módulo carregar
// sob vitest.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { resolveTenant } = await import("./tenant");
const { authSql, sql: appSql } = await import("@/db/client");
const { auth } = await import("@/auth/auth");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_MULTI = "a0000000-0000-0000-0000-000000000010"; // papel em A e B
const U_SINGLE = "a0000000-0000-0000-0000-000000000011"; // papel só em A

let owner: ReturnType<typeof postgres>;
const H = new Headers();

function mockSession(userId: string | null) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    userId ? ({ user: { id: userId } } as never) : null,
  );
}

describe.skipIf(!hasDb)("resolveTenant — A1 cookie é seleção", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_MULTI}, 'Multi', 'multi@x.test'), (${U_SINGLE}, 'Single', 'single@x.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_MULTI}, ${CLINIC_A}, 'coordenador'),
      (${U_MULTI}, ${CLINIC_B}, 'terapeuta'),
      (${U_SINGLE}, ${CLINIC_A}, 'terapeuta')`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("sem sessão → unauthenticated", async () => {
    mockSession(null);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("unauthenticated");
  });

  test("uma clínica, sem cookie → ok e seleciona automaticamente", async () => {
    mockSession(U_SINGLE);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ctx.clinicId).toBe(CLINIC_A);
      expect(r.ctx.role).toBe("terapeuta");
    }
  });

  test("A1: cookie aponta clínica SEM papel → ignora, cai em seleção", async () => {
    mockSession(U_SINGLE); // só tem papel em A
    const r = await resolveTenant(H, { activeClinic: CLINIC_B });
    // U_SINGLE não tem papel em B → cookie ignorado; como só tem A, resolve A.
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.ctx.clinicId).toBe(CLINIC_A);
  });

  test("multi-clínica sem cookie → needs_clinic_selection", async () => {
    mockSession(U_MULTI);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("needs_clinic_selection");
    if (r.status === "needs_clinic_selection") {
      expect(r.opcoes.map((o) => o.clinicId).sort()).toEqual(
        [CLINIC_A, CLINIC_B].sort(),
      );
    }
  });

  test("multi-clínica com cookie válido → ok com o papel daquela clínica", async () => {
    mockSession(U_MULTI);
    const r = await resolveTenant(H, { activeClinic: CLINIC_B });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ctx.clinicId).toBe(CLINIC_B);
      expect(r.ctx.role).toBe("terapeuta"); // papel de B, não o coordenador de A
    }
  });
});
