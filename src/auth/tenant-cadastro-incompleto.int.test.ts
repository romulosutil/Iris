/**
 * Integração — Task 10. Cobre o caso em que o provisionamento de cadastro
 * self-service (`src/auth/cadastro.ts`) morre entre criar o `app_user` e criar
 * a clínica/`user_role` (não é atômico). Hoje `resolveTenant` devolve
 * `no_access` para esse usuário — beco sem saída, com o e-mail já queimado.
 * Depois do fix deve devolver `cadastro_incompleto` com o `userId`, sem
 * conceder acesso a nada.
 *
 * Rodada de correção 1 (review): o arquivo original só cobria o caso
 * positivo (zero vínculo → cadastro_incompleto) — a mutação "sempre
 * cadastro_incompleto" passava verde contra ele isolado (M-1). Acrescenta:
 * - caso negativo (usuário COM vínculo não é cadastro_incompleto);
 * - caso do achado I-2: usuário sem vínculo MAS com `professional_consent`
 *   pregresso (simula uma revogação futura de `equipe/`) deve resolver
 *   `no_access`, NUNCA `cadastro_incompleto` — senão o botão "Concluir
 *   cadastro" leva `criarContaEClinica` a provisionar uma clínica NOVA para
 *   um usuário cujo acesso foi revogado.
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

const CLINIC_X = "b0000000-0000-0000-0000-000000000001";
const U_SEM_VINCULO = "a0000000-0000-0000-0000-000000000012"; // app_user sem user_role, sem aceite
const U_COM_VINCULO = "a0000000-0000-0000-0000-000000000013"; // caso negativo do M-1
const U_REVOGADO = "a0000000-0000-0000-0000-000000000014"; // sem vinculo, MAS com aceite pregresso (I-2)

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
    await owner`TRUNCATE clinic, app_user, user_role, professional_consent RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_X}, 'X')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_SEM_VINCULO}, 'Sem Vinculo', 'sem-vinculo@x.test'),
      (${U_COM_VINCULO}, 'Com Vinculo', 'com-vinculo@x.test'),
      (${U_REVOGADO}, 'Revogado', 'revogado@x.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COM_VINCULO}, ${CLINIC_X}, 'terapeuta')`;
    // Simula um aceite gravado ANTES de uma revogação futura (hoje nada em
    // produção apaga user_role — ver comentário de resolveTenant em tenant.ts).
    await owner`INSERT INTO professional_consent (user_id, clinic_id, versao_termo) VALUES
      (${U_REVOGADO}, ${CLINIC_X}, 'v1')`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await owner?.end();
    await authSql.end();
    await appSql.end();
  });

  test("app_user sem nenhum user_role e sem aceite pregresso → cadastro_incompleto com userId", async () => {
    mockSession(U_SEM_VINCULO);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("cadastro_incompleto");
    if (r.status === "cadastro_incompleto") {
      expect(r.userId).toBe(U_SEM_VINCULO);
    }
  });

  test("M-1: app_user COM user_role NÃO é cadastro_incompleto", async () => {
    mockSession(U_COM_VINCULO);
    const r = await resolveTenant(H, {});
    expect(r.status).not.toBe("cadastro_incompleto");
    expect(r.status).toBe("ok");
  });

  test("I-2: app_user sem user_role MAS com professional_consent pregresso → no_access, NUNCA cadastro_incompleto", async () => {
    mockSession(U_REVOGADO);
    const r = await resolveTenant(H, {});
    expect(r.status).toBe("no_access");
    expect(r.status).not.toBe("cadastro_incompleto");
  });
});
