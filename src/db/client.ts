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

export type Schema = typeof schema;
