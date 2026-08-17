/**
 * Integração — Task 10, M-2 (review): antes desta rodada, zero teste cobria
 * o mapeamento status → rota de `getTenantContext`. Trocar
 * `redirect("/sem-acesso?motivo=cadastro-incompleto")` por
 * `redirect("/sem-acesso")` deixava a suíte inteira verde (508/508) — só a
 * mutação inversa em `tenant.int.test.ts` (via `resolveTenant`) pegava algo, e
 * mesmo essa não testava a ROTA, só o `status`. Este arquivo chama
 * `getTenantContext()` de ponta a ponta (com `cookies`/`headers` mockados e o
 * banco semeado por status) e verifica o argumento exato passado a
 * `redirect()` para cada status de `TenantResolution`, incluindo o gate de
 * MFA dentro de `case "ok"`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

let cookieJar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar[name] !== undefined ? { value: cookieJar[name] } : undefined,
  }),
  headers: async () => new Headers(),
}));

const { getTenantContext } = await import("./tenant");
const { authSql, sql: appSql } = await import("@/db/client");
const { auth } = await import("@/auth/auth");

const CLINIC_A = "c0000000-0000-0000-0000-000000000001";
const CLINIC_B = "c0000000-0000-0000-0000-000000000002";
const U_SEM_VINCULO = "d0000000-0000-0000-0000-000000000001"; // cadastro_incompleto
const U_REVOGADO = "d0000000-0000-0000-0000-000000000002"; // no_access
const U_MULTI = "d0000000-0000-0000-0000-000000000003"; // needs_clinic_selection
const U_NEEDS_ROLE = "d0000000-0000-0000-0000-000000000004"; // needs_role_selection
const U_ADMIN_SEM_MFA = "d0000000-0000-0000-0000-000000000005"; // ok, não clínico, sem MFA
const U_TERAPEUTA_SEM_MFA = "d0000000-0000-0000-0000-000000000006"; // ok, clínico, sem MFA → /mfa/setup
const U_TERAPEUTA_COM_MFA = "d0000000-0000-0000-0000-000000000007"; // ok, clínico, com MFA → retorna ctx

let owner: ReturnType<typeof postgres>;

function mockSession(userId: string | null, twoFactorEnabled = false) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue(
    userId ? ({ user: { id: userId, twoFactorEnabled } } as never) : null,
  );
}

async function redirectedTo(): Promise<string | undefined> {
  try {
    await getTenantContext();
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith("REDIRECT:")) return msg.slice("REDIRECT:".length);
    throw err;
  }
  return undefined;
}

describe.skipIf(!hasDb)(
  "getTenantContext — mapeamento status → rota (M-2)",
  () => {
    beforeAll(async () => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await owner`TRUNCATE clinic, app_user, user_role, professional_consent RESTART IDENTITY CASCADE`;
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_SEM_VINCULO}, 'Sem Vinculo', 'sv@x.test'),
      (${U_REVOGADO}, 'Revogado', 'rev@x.test'),
      (${U_MULTI}, 'Multi', 'multi@x.test'),
      (${U_NEEDS_ROLE}, 'NeedsRole', 'nr@x.test'),
      (${U_ADMIN_SEM_MFA}, 'Admin', 'admin@x.test'),
      (${U_TERAPEUTA_SEM_MFA}, 'TerapSemMfa', 'tsm@x.test'),
      (${U_TERAPEUTA_COM_MFA}, 'TerapComMfa', 'tcm@x.test')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_REVOGADO}, ${CLINIC_A}, 'terapeuta'),
      (${U_MULTI}, ${CLINIC_A}, 'terapeuta'), (${U_MULTI}, ${CLINIC_B}, 'terapeuta'),
      (${U_NEEDS_ROLE}, ${CLINIC_A}, 'terapeuta'), (${U_NEEDS_ROLE}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_ADMIN_SEM_MFA}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_TERAPEUTA_SEM_MFA}, ${CLINIC_A}, 'terapeuta'),
      (${U_TERAPEUTA_COM_MFA}, ${CLINIC_A}, 'terapeuta')`;
      // U_REVOGADO teve o vínculo removido DEPOIS de aceitar os termos —
      // simula o cenário do I-2. Removemos o user_role dele para ficar com
      // zero vínculo, mas mantemos o aceite.
      await owner`INSERT INTO professional_consent (user_id, clinic_id, versao_termo) VALUES
      (${U_REVOGADO}, ${CLINIC_A}, 'v1')`;
      await owner`DELETE FROM user_role WHERE user_id = ${U_REVOGADO}`;
    });

    afterAll(async () => {
      vi.restoreAllMocks();
      await owner?.end();
      await authSql.end();
      await appSql.end();
    });

    test("unauthenticated → /login", async () => {
      cookieJar = {};
      mockSession(null);
      expect(await redirectedTo()).toBe("/login");
    });

    test("cadastro_incompleto → /sem-acesso?motivo=cadastro-incompleto", async () => {
      cookieJar = {};
      mockSession(U_SEM_VINCULO);
      expect(await redirectedTo()).toBe(
        "/sem-acesso?motivo=cadastro-incompleto",
      );
    });

    test("no_access (vínculo revogado após aceite) → /sem-acesso (sem motivo)", async () => {
      cookieJar = {};
      mockSession(U_REVOGADO);
      expect(await redirectedTo()).toBe("/sem-acesso");
    });

    test("needs_clinic_selection → /selecionar-clinica", async () => {
      cookieJar = {};
      mockSession(U_MULTI);
      expect(await redirectedTo()).toBe("/selecionar-clinica");
    });

    test("needs_role_selection → /selecionar-papel", async () => {
      cookieJar = {};
      mockSession(U_NEEDS_ROLE);
      expect(await redirectedTo()).toBe("/selecionar-papel");
    });

    test("ok + não clínico (admin_recepcao) sem MFA → sem redirect (retorna ctx)", async () => {
      cookieJar = {};
      mockSession(U_ADMIN_SEM_MFA, false);
      const ctx = await getTenantContext();
      expect(ctx.role).toBe("admin_recepcao");
    });

    test("ok + clínico (terapeuta) sem MFA → /mfa/setup", async () => {
      cookieJar = {};
      mockSession(U_TERAPEUTA_SEM_MFA, false);
      expect(await redirectedTo()).toBe("/mfa/setup");
    });

    test("ok + clínico (terapeuta) com MFA → sem redirect (retorna ctx)", async () => {
      cookieJar = {};
      mockSession(U_TERAPEUTA_COM_MFA, true);
      const ctx = await getTenantContext();
      expect(ctx.role).toBe("terapeuta");
      expect(ctx.mfaEnrolled).toBe(true);
    });
  },
);
