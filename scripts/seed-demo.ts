/**
 * Seed Demo (Iris) — clínica `is_demo = true`
 *
 * 1. Limpa todas as tabelas do banco de dados local (bypassing RLS via ownerSql)
 * 2. Cria a clínica demo com terapeuta, paciente, protocolo ativo e sessão de
 *    hoje (`scripts/lib/seed-demo-clinic.ts`)
 *
 * Uso local, para rodar SÓ `e2e/diario-demo.spec.ts` / `e2e/revisao.spec.ts`:
 *   pnpm seed:demo
 *
 * Para a suíte `pnpm test:e2e` inteira (9 specs), use `pnpm seed:e2e`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { assertSeedAllowed } from "./lib/guardrail-seed";
import { seedDemoClinic } from "./lib/seed-demo-clinic";

async function main() {
  const migrationUrl =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error(
      "MIGRATION_DATABASE_URL / DATABASE_URL não definida nas variáveis de ambiente.",
    );
  }

  assertSeedAllowed(migrationUrl);

  console.log("🔄 Conectando ao Postgres com perfil de owner (bypassa RLS)...");
  const ownerSql = postgres(migrationUrl, { max: 1 });
  const ownerDb = drizzle(ownerSql, { schema, casing: "snake_case" });

  console.log("🧹 Limpando dados antigos do banco local...");
  const tableRows = await ownerSql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '%drizzle%'
      AND table_name NOT LIKE '%journal%';
  `;
  if (tableRows.length > 0) {
    const tableNames = tableRows.map((r) => `"${r.table_name}"`).join(", ");
    await ownerSql.unsafe(
      `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`,
    );
    console.log(
      `✅ Banco de dados limpo (${tableRows.length} tabelas truncadas).`,
    );
  }

  await seedDemoClinic(ownerDb, ownerSql);

  await ownerSql.end();

  // Ver comentário equivalente em scripts/seed-e2e.ts: `provisionUser`
  // deixa handles vivos (import de `next/headers` fora de request scope) e o
  // processo não sai sozinho mesmo com o trabalho todo concluído.
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro ao executar seed demo:", err);
  process.exit(1);
});
