import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { hasDb } from "@tests/integration-env";

/**
 * Constraint global do projeto: "toda tabela nova nasce com RLS habilitada,
 * policies explícitas e teste em `pnpm test:rls`". A migração 0061 escreveu a
 * DDL certa; sem ESTE arquivo, nada na suíte defendia o isolamento — dava para
 * apagar `ENABLE ROW LEVEL SECURITY` ou dar GRANT a `app_role` e os 8 testes
 * de `src/lib/throttle.int.test.ts` continuavam verdes (eles rodam como
 * `iris_auth`, que é justamente a role que TEM acesso).
 *
 * `auth_throttle` não é tabela de tenant: não tem `clinic_id` e não guarda dado
 * de paciente. Logo o que precisa ser provado NÃO é isolamento por clínica
 * (não existe) e sim que a conexão do PRODUTO (`app_role`, a que passa por
 * `withTenant`) não alcança a tabela de jeito nenhum — nem para ler o contador
 * de outra pessoa, nem para zerá-lo.
 */
/**
 * Drizzle embrulha o erro do driver ("Failed query: …") e põe o erro real do
 * Postgres em `cause`. Asserir só a mensagem de fora faria o teste passar com
 * QUALQUER falha de query — inclusive um erro de sintaxe meu. Aqui a asserção é
 * no SQLSTATE `42501` (insufficient_privilege), que é o fato que interessa.
 */
async function esperaPermissaoNegada(
  promessa: Promise<unknown>,
): Promise<void> {
  let capturado: unknown;
  try {
    await promessa;
  } catch (err) {
    capturado = err;
  }
  expect(capturado, "esperava erro do Postgres, a query passou").toBeDefined();
  const causa = (capturado as { cause?: { code?: string; message?: string } })
    .cause;
  expect(causa?.code, `SQLSTATE inesperado: ${causa?.message}`).toBe("42501");
}

describe.skipIf(!hasDb)("auth_throttle — RLS e isolamento de role", () => {
  it("tem RLS habilitada e FORCE (nem o dono escapa da policy)", async () => {
    const r = await db.execute(sql`
      select relrowsecurity, relforcerowsecurity
      from pg_class where relname = 'auth_throttle'`);
    const linha = (
      r as unknown as {
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    )[0];
    expect(linha?.relrowsecurity).toBe(true);
    expect(linha?.relforcerowsecurity).toBe(true);
  });

  it("tem policy explícita, e ela é dirigida a iris_auth (não a PUBLIC)", async () => {
    const r = await db.execute(sql`
      select polname, pg_get_expr(polqual, polrelid) as usando,
             (select array_agg(rolname) from pg_roles where oid = any(polroles)) as roles
      from pg_policy where polrelid = 'auth_throttle'::regclass`);
    const policies = r as unknown as {
      polname: string;
      usando: string | null;
      roles: string[] | null;
    }[];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      // `roles` NULL/{0} significaria PUBLIC — todo mundo, inclusive app_role.
      expect(p.roles ?? []).toContain("iris_auth");
      expect(p.roles ?? []).not.toContain("app_role");
      expect(p.roles ?? []).not.toContain("public");
    }
  });

  it("app_role não tem grant NENHUM (nem SELECT)", async () => {
    const r = await db.execute(sql`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'auth_throttle' and grantee = 'app_role'`);
    expect(r as unknown as unknown[]).toHaveLength(0);
  });

  it("a conexão do produto (app_role) não LÊ a tabela — permission denied", async () => {
    await esperaPermissaoNegada(
      db.execute(sql`select chave from auth_throttle limit 1`),
    );
  });

  it("a conexão do produto (app_role) não APAGA o contador — permission denied", async () => {
    // O ataque que isto fecha: se `app_role` pudesse escrever aqui, qualquer
    // caminho do produto (ou uma injeção nele) zeraria o próprio bloqueio de
    // força bruta antes de tentar de novo.
    await esperaPermissaoNegada(db.execute(sql`delete from auth_throttle`));
  });
});
