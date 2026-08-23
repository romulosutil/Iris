/**
 * Seed E2E (Iris) — suíte `pnpm test:e2e` completa (9 specs)
 *
 * Playwright roda com `workers: 1` e a suíte inteira compartilha o mesmo
 * banco (playwright.config.ts) — não dá pra rodar `seed:clinic` e
 * `seed:demo` em sequência, o segundo trunca o que o primeiro criou.
 *
 * Este seed junta os dois cenários num único truncate:
 * 1. Clínica "Clínica E2E" + coordenador (e2e@iris.test) — usada por
 *    `cadastro-clinico`, `login`, `represcricao-mv4`.
 * 2. Clínica demo (`is_demo = true`) + terapeuta/paciente/protocolo/sessão —
 *    usada por `diario-demo`, `revisao` (`scripts/lib/seed-demo-clinic.ts`).
 *
 * `cadastro`, `landing-a11y`, `reenvio-email`, `seguranca-cadastro` não
 * dependem de dado semeado (fluxo público de cadastro).
 *
 * Uso:
 *   pnpm seed:e2e
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clinic, protocol } from "@/db/schema";
import * as schema from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";
import { assertSeedAllowed } from "./lib/guardrail-seed";
import { seedDemoClinic } from "./lib/seed-demo-clinic";

async function main() {
  const nomeClinica = "Clínica E2E";
  const emailCoord = "e2e@iris.test";
  const senhaCoord = "Senha E2E 123";
  const nomeCoord = "Coordenador E2E";

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

  console.log("📦 Cadastrando catálogo de famílias de protocolos...");
  await ownerDb.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)'),
      ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
      ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação'),
      ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log(`🏥 Criando clínica "${nomeClinica}"...`);
  const [createdClinic] = await ownerDb
    .insert(clinic)
    .values({ nome: nomeClinica })
    .returning();
  if (!createdClinic) throw new Error("Falha ao criar clínica.");

  console.log("📋 Cadastrando protocolo padrão da clínica...");
  await ownerDb.insert(protocol).values({
    clinicId: createdClinic.id,
    nome: "VB-MAPP",
    disciplina: "ABA",
    familia: "aba_marcos_desenvolvimento",
  });

  console.log(`👤 Provisionando coordenador (${emailCoord})...`);
  await provisionUser({
    email: emailCoord,
    nome: nomeCoord,
    senha: senhaCoord,
    clinicId: createdClinic.id,
    papel: "coordenador",
    emailVerificado: true,
    db: ownerDb,
  });

  await seedDemoClinic(ownerDb, ownerSql);

  console.log("\n==================================================");
  console.log("🎉 SEED E2E CONCLUÍDO COM SUCESSO!");
  console.log("==================================================");
  console.log(`Clínica E2E:  "${nomeClinica}" (coordenador: ${emailCoord})`);
  console.log(`Clínica demo: terapeuta.demo@iris.test / Senha Demo 123`);
  console.log("==================================================\n");

  await ownerSql.end();

  // `auth.api.signUpEmail` (Better-Auth, dentro de `provisionUser`) importa
  // `next/headers` e mantém handles vivos fora de um request scope real — o
  // processo não sai sozinho mesmo com todo trabalho e conexões terminados.
  // Medido: dados no banco corretos, processo pendurado indefinidamente sem
  // este `exit` explícito (travaria CI).
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro ao executar seed e2e:", err);
  process.exit(1);
});
