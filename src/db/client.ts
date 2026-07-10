import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

// Conexão de runtime — usuário membro de app_role (RLS aplica).
export const sql = postgres(url, { max: 10 });

// db "cru" (sem contexto de tenant). NÃO usar para dados de paciente —
// use withTenant() de ./rls. Existe para health-checks e queries fora de tenant.
export const db = drizzle(sql, { schema, casing: "snake_case" });

// ─── Conexão de AUTH/bootstrap (role iris_auth, NOBYPASSRLS) ─────────────────
// Usada SÓ pelo adapter do Better-Auth e por src/auth/{tenant,provisioning}.ts.
// iris_auth tem GRANT em auth_* (revogadas de app_role) + policies role-targeted
// permissivas em app_user/clinic/user_role p/ ler/escrever identidade pré-GUC.
// ⚠️ authDb NUNCA toca dado de paciente — isso fura o gargalo único withTenant.
const authUrl = process.env.AUTH_DATABASE_URL;
if (!authUrl) throw new Error("AUTH_DATABASE_URL não definida");
export const authSql = postgres(authUrl, { max: 5 });
export const authDb = drizzle(authSql, { schema, casing: "snake_case" });

export type Schema = typeof schema;
