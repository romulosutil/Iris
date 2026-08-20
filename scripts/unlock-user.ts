import postgres from "postgres";

const migrationUrl =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  console.error(
    "MIGRATION_DATABASE_URL ou DATABASE_URL não encontrada no .env",
  );
  process.exit(1);
}

const sql = postgres(migrationUrl, { max: 1 });

async function main() {
  const email = (process.argv[2] || "sutil.romulo@gmail.com")
    .toLowerCase()
    .trim();
  console.log(`🔍 Buscando usuário com e-mail: ${email}...`);

  const users = await sql<
    {
      id: string;
      name: string;
      email: string;
      email_verified: boolean;
      two_factor_enabled: boolean;
    }[]
  >`
    SELECT id, name, email, email_verified, two_factor_enabled
    FROM app_user
    WHERE LOWER(email) = ${email}
  `;

  if (users.length === 0 || !users[0]) {
    console.log("❌ Usuário não encontrado em app_user!");
    const allUsers =
      await sql`SELECT id, name, email, email_verified FROM app_user LIMIT 10`;
    console.log("Usuários existentes no banco:", allUsers);
    await sql.end();
    return;
  }

  const user = users[0];
  console.log("👤 Usuário encontrado:", user);

  // 1. Atualizar email_verified e desabilitar 2FA
  await sql`
    UPDATE app_user
    SET email_verified = true, two_factor_enabled = false
    WHERE id = ${user.id}
  `;
  console.log(
    "✅ email_verified setado para true e two_factor_enabled setado para false",
  );

  // 2. Limpar two_factor se existir
  const deletedTwoFactor = await sql`
    DELETE FROM two_factor
    WHERE user_id = ${user.id}
    RETURNING id
  `;
  console.log(
    `✅ Registros de two_factor removidos: ${deletedTwoFactor.length}`,
  );

  // 3. Limpar auth_throttle
  await sql`
    DELETE FROM auth_throttle
    WHERE chave LIKE ${"%" + email + "%"}
  `;
  console.log(`✅ Registros de throttle limpos`);

  // 4. Checar vínculos de clínica e papel
  const roles = await sql<
    { clinic_id: string; papel: string; clinica_nome: string }[]
  >`
    SELECT ur.clinic_id, ur.papel, c.nome as clinica_nome
    FROM user_role ur
    LEFT JOIN clinic c ON c.id = ur.clinic_id
    WHERE ur.user_id = ${user.id}
  `;
  console.log("🏥 Vínculos de clínica/papel:", roles);

  if (roles.length === 0) {
    console.log(
      "⚠️ Usuário não possui vínculo com nenhuma clínica. Buscando clínicas disponíveis...",
    );
    const clinics = await sql<{ id: string; nome: string }[]>`
      SELECT id, nome FROM clinic LIMIT 1
    `;
    if (clinics.length > 0 && clinics[0]) {
      const c = clinics[0];
      await sql`
        INSERT INTO user_role (user_id, clinic_id, papel)
        VALUES (${user.id}, ${c.id}, 'coordenador')
        ON CONFLICT DO NOTHING
      `;
      console.log(
        `✅ Usuário vinculado à clínica "${c.nome}" (${c.id}) como coordenador!`,
      );
    } else {
      console.log("⚠️ Nenhuma clínica cadastrada no banco.");
    }
  }

  await sql.end();
  console.log("🎉 Usuário destravado com sucesso!");
}

main().catch(async (err) => {
  console.error("Erro:", err);
  await sql.end();
  process.exit(1);
});
