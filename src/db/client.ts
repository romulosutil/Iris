import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Wrapper preguiçoso: adia a criação do alvo até o PRIMEIRO acesso/uso. Assim o
 * módulo importa sem exigir env de runtime (DATABASE_URL/AUTH_DATABASE_URL) — o
 * `next build` coleta page data sem abrir conexão, e o throw só acontece numa
 * request/teste real, que é onde a env de fato existe (runtime no Easypanel).
 * Métodos são bindados ao alvo real; `sql` continua chamável (tagged template).
 */
function lazy<T extends object>(init: () => T): T {
  let cached: T | undefined;
  const resolve = () => (cached ??= init());
  return new Proxy(function () {} as unknown as T, {
    get(_t, prop) {
      const target = resolve() as Record<PropertyKey, unknown>;
      const val = target[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
    set(_t, prop, val) {
      (resolve() as Record<PropertyKey, unknown>)[prop] = val;
      return true;
    },
    has(_t, prop) {
      return prop in (resolve() as object);
    },
    apply(_t, thisArg, args) {
      return (resolve() as (...a: unknown[]) => unknown).apply(thisArg, args);
    },
  });
}

// Conexão de runtime — usuário membro de app_role (RLS aplica).
export const sql: Sql = lazy(() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return postgres(url, { max: 10 });
});

// db "cru" (sem contexto de tenant). NÃO usar para dados de paciente —
// use withTenant() de ./rls. Existe para health-checks e queries fora de tenant.
export const db: Db = lazy(() => drizzle(sql, { schema, casing: "snake_case" }));

// ─── Conexão de AUTH/bootstrap (role iris_auth, NOBYPASSRLS) ─────────────────
// Usada SÓ pelo adapter do Better-Auth e por src/auth/{tenant,provisioning}.ts.
// iris_auth tem GRANT em auth_* (revogadas de app_role) + policies role-targeted
// permissivas em app_user/clinic/user_role p/ ler/escrever identidade pré-GUC.
// ⚠️ authDb NUNCA toca dado de paciente — isso fura o gargalo único withTenant.
export const authSql: Sql = lazy(() => {
  const authUrl = process.env.AUTH_DATABASE_URL;
  if (!authUrl) throw new Error("AUTH_DATABASE_URL não definida");
  return postgres(authUrl, { max: 5 });
});
export const authDb: Db = lazy(() =>
  drizzle(authSql, { schema, casing: "snake_case" }),
);

export type Schema = typeof schema;
