/**
 * Seed Principal (Iris)
 *
 * Ponto de entrada padrão para povoar o banco de dados local com catálogo de protocolos,
 * clínica padrão e usuário coordenador inicial.
 *
 * Guardrail de ambiente (D52):
 * - Executa apenas contra localhost / 127.0.0.1 / ::1 por padrão.
 * - Requer ALLOW_SEED_REMOTE=true para executar contra bancos remotos.
 *
 * Uso:
 *   pnpm seed
 *   pnpm tsx --conditions=react-server --env-file=.env scripts/seed.ts
 */
import { assertSeedAllowed } from "./lib/guardrail-seed";

export {
  assertSeedAllowed,
  extractDatabaseHost,
  isLocalDatabase,
  isLocalDatabaseHost,
} from "./lib/guardrail-seed";

async function main() {
  const migrationUrl =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!migrationUrl) {
    throw new Error(
      "MIGRATION_DATABASE_URL / DATABASE_URL não definida nas variáveis de ambiente.",
    );
  }

  // Guardrail de ambiente fail-closed
  assertSeedAllowed(migrationUrl);

  // Executar o seed local
  await import("./seed-local");
}

// Executa caso invocado diretamente pela CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))
) {
  main().catch((err) => {
    console.error("❌ Erro ao executar seed:", err);
    process.exit(1);
  });
}
