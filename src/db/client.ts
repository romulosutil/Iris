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

const globalForDb = globalThis as unknown as {
  sql: Sql | undefined;
  authSql: Sql | undefined;
};

// Conexão de runtime — usuário membro de app_role (RLS aplica).
export const sql: Sql = lazy(() => {
  if (globalForDb.sql) return globalForDb.sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const instance = postgres(url, { max: 10 });
  if (process.env.NODE_ENV !== "production") globalForDb.sql = instance;
  return instance;
});

// db "cru" (sem contexto de tenant). NÃO usar para dados de paciente —
// use withTenant() de ./rls. Existe para health-checks e queries fora de tenant.
export const db: Db = lazy(() =>
  drizzle(sql, { schema, casing: "snake_case" }),
);

// ─── Conexão de AUTH/bootstrap (role iris_auth, NOBYPASSRLS) ─────────────────
// Usada SÓ pelo adapter do Better-Auth e por src/auth/{tenant,provisioning}.ts.
// iris_auth tem GRANT em auth_* (revogadas de app_role) + policies role-targeted
// permissivas em app_user/clinic/user_role p/ ler/escrever identidade pré-GUC.
// ⚠️ authDb NUNCA toca dado de paciente — isso fura o gargalo único withTenant.
export const authSql: Sql = lazy(() => {
  if (globalForDb.authSql) return globalForDb.authSql;
  const authUrl = process.env.AUTH_DATABASE_URL;
  if (!authUrl) throw new Error("AUTH_DATABASE_URL não definida");
  const instance = postgres(authUrl, { max: 5 });
  if (process.env.NODE_ENV !== "production") globalForDb.authSql = instance;
  return instance;
});
export const authDb: Db = lazy(() =>
  drizzle(authSql, { schema, casing: "snake_case" }),
);

// ─── Conexão do WORKER de transcrição (role membro de iris_asr_worker) ───────
// Usada SÓ por `src/app/api/internal/jobs/asr-transcrever/route.ts` (#494/T18).
//
// POR QUE NÃO REUSAR `db`: `app_asr_reservar`/`app_asr_concluir`/
// `app_asr_falhar`/`app_asr_expirar_presos` são `SECURITY DEFINER`
// CROSS-TENANT e não devolvem 1 bit — a reserva entrega `clinic_id` e a chave
// do objeto de áudio de OUTRAS clínicas, o concluir escreve texto arbitrário na
// linha de qualquer clínica. Enquanto o `EXECUTE` estivesse em `app_role` (o
// papel de toda requisição web logada), essa fronteira seria uma invariante de
// camada de app: valeria só enquanto ninguém escrevesse a chamada errada.
// Com papel próprio, o banco recusa — `app_role` recebe `42501`.
//
// Mesmo idioma do sweeper (`ASR_SWEEPER_DATABASE_URL`, T15): credencial de
// login provisionada fora das migrações, `IN ROLE iris_asr_worker` (a role
// NOLOGIN nasce na migração 0140).
//
// `max: 2` e não 10: este pool serve UM job sequencial (LOTE_PADRAO clipes,
// um de cada vez). Dimensioná-lo como o da app só reservaria conexões ociosas
// no Postgres para ticks que nunca as usam.
const globalForAsr = globalThis as unknown as { asrWorkerSql: Sql | undefined };

export const asrWorkerSql: Sql = lazy(() => {
  if (globalForAsr.asrWorkerSql) return globalForAsr.asrWorkerSql;
  const url = process.env.ASR_WORKER_DATABASE_URL;
  // Fail-closed, sem cair para `DATABASE_URL`: um fallback silencioso para a
  // credencial da app faria o worker rodar com `app_role` — que não tem mais o
  // grant — e o tick morreria com `42501` a cada passada, ou pior, voltaria a
  // funcionar se alguém um dia reconcedesse o EXECUTE, desfazendo o T18 sem
  // diff. Mesma disciplina do sweeper, que RECUSA rodar sem a env dele.
  if (!url) {
    throw new Error(
      "ASR_WORKER_DATABASE_URL não definida — o worker de transcrição precisa de credencial membro de iris_asr_worker (ver .env.example e db/migrations/0140_asr_worker_role.sql)",
    );
  }
  const instance = postgres(url, { max: 2 });
  if (process.env.NODE_ENV !== "production")
    globalForAsr.asrWorkerSql = instance;
  return instance;
});

export const asrWorkerDb: Db = lazy(() =>
  drizzle(asrWorkerSql, { schema, casing: "snake_case" }),
);

export type Schema = typeof schema;
