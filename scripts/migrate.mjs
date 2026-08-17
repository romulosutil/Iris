/**
 * Migrator de deploy — aplica db/migrations e SAI. Roda como um passo do
 * pipeline (serviço/pre-deploy no Easypanel), ANTES do app rolar, para o código
 * nunca subir à frente do schema (o drift que quebrou a Agenda 2.0 em prod).
 *
 * Usa `MIGRATION_DATABASE_URL` — o dono/superuser — porque migração faz DDL,
 * que o usuário de runtime (app_role, RLS) não tem. Cai para DATABASE_URL só
 * para paridade de dev, onde o superuser `iris` é o próprio DATABASE_URL (ver
 * drizzle.config.ts e infra/README.md §"role de runtime").
 *
 * `.mjs` de node puro (sem tsx/drizzle-kit, ambos devDeps): `drizzle-orm` e
 * `postgres` são deps de produção, então isto roda num contexto enxuto de
 * deploy sem devDependencies. Sai != 0 em qualquer falha — assim o pipeline
 * BLOQUEIA o deploy do app em vez de deixá-lo subir contra um schema velho.
 *
 *   node --env-file=.env scripts/migrate.mjs   # dev/local (lê .env)
 *   node scripts/migrate.mjs                    # deploy (env injetada pelo host)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { verificarHashesAplicadas } from "./verificar-hash-migracoes.mjs";

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "MIGRATION_DATABASE_URL (ou DATABASE_URL em dev) não definida — migração precisa da role dona (DDL).",
    );
  }

  // max:1 — migração é serial; uma única conexão evita corrida entre statements.
  const sql = postgres(url, { max: 1 });
  try {
    // Guard D17 (#215): migração já aplicada cujo .sql foi editado no repo
    // depois disso nunca reroda — Drizzle aplica por tag, não por conteúdo.
    // Aborta o deploy aqui, antes de tocar em qualquer DDL novo.
    const divergentes = await verificarHashesAplicadas(sql);
    if (divergentes.length > 0) {
      const lista = divergentes
        .map(
          (d) =>
            `  - ${d.tag} (aplicado=${d.hashAplicado.slice(0, 12)}… disco=${d.hashEsperado.slice(0, 12)}…)`,
        )
        .join("\n");
      throw new Error(
        `Migração(ões) já aplicada(s) foram editadas no repo depois de rodar em produção (D17, #215):\n${lista}\n` +
          "Reverta o arquivo para o conteúdo aplicado, ou escreva uma migração NOVA — nunca edite uma tag já em drizzle.__drizzle_migrations.",
      );
    }

    await migrate(drizzle(sql), { migrationsFolder: "./db/migrations" });
    console.log("Migrações aplicadas (db/migrations) — schema em dia.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Falha ao migrar — deploy deve ser abortado:", err);
  process.exit(1);
});
