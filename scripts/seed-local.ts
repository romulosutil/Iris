/**
 * Seed Local Limpo (Iris)
 * 
 * 1. Limpa todas as tabelas do banco de dados local (bypassing RLS via ownerSql)
 * 2. Cadastra o catálogo mestre de protocolos
 * 3. Cria 1 clínica padrão ("Clínica Iris")
 * 4. Cadastra os protocolos padrão da clínica
 * 5. Provisiona 1 único usuário Coordenador com e-mail verificado
 * 
 * Uso:
 *   pnpm seed:local
 *   pnpm seed:local "Nome da Clínica" "email@coord.test" "Senha123!" "Nome Coordenador"
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clinic, protocol } from "@/db/schema";
import * as schema from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

async function main() {
  const nomeClinica = process.argv[2] || "Clínica Iris";
  const emailCoord = process.argv[3] || "coordenador@iris.test";
  const senhaCoord = process.argv[4] || "SenhaLocal123!";
  const nomeCoord = process.argv[5] || "Coordenador Local";

  const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error("MIGRATION_DATABASE_URL / DATABASE_URL não definida nas variáveis de ambiente.");
  }

  console.log("🔄 Conectando ao Postgres com perfil de owner (bypassa RLS)...");
  const ownerSql = postgres(migrationUrl, { max: 1 });
  const ownerDb = drizzle(ownerSql, { schema, casing: "snake_case" });

  // 1. Limpeza total de tabelas de domínio (preservando schema e histórico de migrações)
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
    const tableNames = tableRows
      .map((r) => `"${r.table_name}"`)
      .join(", ");
    await ownerSql.unsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
    console.log(`✅ Banco de dados limpo (${tableRows.length} tabelas truncadas).`);
  }

  // 2. Seed do catálogo mestre de protocolos
  console.log("📦 Cadastrando catálogo de famílias de protocolos...");
  await ownerDb.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)'),
      ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
      ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação'),
      ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 3. Criação da Clínica
  console.log(`🏥 Criando clínica "${nomeClinica}"...`);
  const [createdClinic] = await ownerDb
    .insert(clinic)
    .values({ nome: nomeClinica })
    .returning();
  if (!createdClinic) {
    throw new Error("Falha ao criar clínica.");
  }
  const c = createdClinic;

  // 4. Protocolos padrão da Clínica
  console.log("📋 Cadastrando protocolos padrão da clínica (10 protocolos)...");
  await ownerDb.insert(protocol).values([
    {
      clinicId: c.id,
      nome: "VB-MAPP",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      clinicId: c.id,
      nome: "Denver (ESDM)",
      disciplina: "Psicopedagogia",
      familia: "intervencao_naturalista",
    },
    {
      clinicId: c.id,
      nome: "ABLLS-R",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      clinicId: c.id,
      nome: "AFLS",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      clinicId: c.id,
      nome: "PROC",
      disciplina: "Fonoaudiologia",
      familia: "fonoaudiologia",
    },
    {
      clinicId: c.id,
      nome: "ABFW",
      disciplina: "Fonoaudiologia",
      familia: "fonoaudiologia",
    },
    {
      clinicId: c.id,
      nome: "MBGR",
      disciplina: "Fonoaudiologia",
      familia: "fonoaudiologia",
    },
    {
      clinicId: c.id,
      nome: "PEDI",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
    {
      clinicId: c.id,
      nome: "Perfil Sensorial 2",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
    {
      clinicId: c.id,
      nome: "DCDQ",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
  ]);

  // 5. Provisionamento do 1º Coordenador
  console.log(`👤 Provisionando coordenador (${emailCoord})...`);
  const { userId } = await provisionUser({
    email: emailCoord,
    nome: nomeCoord,
    senha: senhaCoord,
    clinicId: c.id,
    papel: "coordenador",
    emailVerificado: true,
    db: ownerDb,
  });

  console.log("\n==================================================");
  console.log("🎉 SEED LOCAL CONCLUÍDO COM SUCESSO!");
  console.log("==================================================");
  console.log(`Clínica:     "${c.nome}" (ID: ${c.id})`);
  console.log(`Coordenador: ${nomeCoord} (ID: ${userId})`);
  console.log(`E-mail:      ${emailCoord}`);
  console.log(`Senha:       ${senhaCoord}`);
  console.log("==================================================\n");

  await ownerSql.end();
}

main().catch((err) => {
  console.error("❌ Erro ao executar seed local:", err);
  process.exit(1);
});
