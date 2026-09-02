/**
 * Destrava um usuário que ficou preso no login (2FA perdido, throttle,
 * e-mail não verificado) — diagnóstico de operação, roda com a role dona.
 *
 * O que faz (numa transação só):
 *   1. `email_verified = true`, `two_factor_enabled = false`;
 *   2. apaga `two_factor` do usuário;
 *   3. limpa `auth_throttle` do e-mail;
 *   4. grava `audit_log` (`acao = 'desbloqueio_usuario_script'`, ator nulo =
 *      ação de script, detalhe SEM PII) em cada clínica em que o usuário tem
 *      vínculo.
 *
 * O que NÃO faz mais (auditoria 360, S-04 / #534):
 *   - não concede papel. A versão anterior, sem vínculo, inseria `coordenador`
 *     na primeira clínica de `SELECT id FROM clinic LIMIT 1` — escalada de
 *     privilégio por script, num tenant escolhido ao acaso. Sem vínculo o
 *     script PARA antes de escrever: use o fluxo de convite.
 *   - não tem e-mail default (S-09): o argumento é obrigatório.
 *
 * Guard de ambiente: role dona fora de localhost só com ALLOW_SEED_REMOTE=true
 * (mesma porta dos seeds — ver `.env.example`).
 *
 * Uso: pnpm unlock:user <email>
 */
import postgres from "postgres";
import { assertScriptRemotoPermitido } from "./lib/guardrail-conexao.mjs";

const migrationUrl =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  console.error(
    "MIGRATION_DATABASE_URL ou DATABASE_URL não encontrada no .env",
  );
  process.exit(1);
}

// Fail-closed: banco remoto exige ALLOW_SEED_REMOTE=true explícito (#534).
assertScriptRemotoPermitido(migrationUrl, { rotulo: "unlock-user" });

const sql = postgres(migrationUrl, { max: 1 });

async function main() {
  // E-mail é argumento obrigatório: sem default pessoal versionado
  // (auditoria 360, S-09). Uso: pnpm unlock:user <email>
  const emailArg = process.argv[2]?.trim();
  if (!emailArg) {
    console.error("Informe o e-mail do usuário: pnpm unlock:user <email>");
    process.exit(1);
  }
  const email = emailArg.toLowerCase();
  console.log(`🔍 Buscando usuário com e-mail: ${email}...`);

  const users = await sql<
    {
      id: string;
      email_verified: boolean;
      two_factor_enabled: boolean;
    }[]
  >`
    SELECT id, email_verified, two_factor_enabled
    FROM app_user
    WHERE LOWER(email) = ${email}
  `;

  if (users.length === 0 || !users[0]) {
    // Sem listar outros usuários: o dump de `app_user` que existia aqui
    // imprimia e-mails de terceiros no terminal.
    console.error("❌ Usuário não encontrado em app_user.");
    await sql.end();
    process.exit(1);
  }

  const user = users[0];
  console.log(
    `👤 Usuário encontrado: id=${user.id} email_verified=${user.email_verified} two_factor_enabled=${user.two_factor_enabled}`,
  );

  // Vínculos ANTES de qualquer escrita: sem clínica não há tenant para a
  // trilha e não há o que destravar — o acesso vem pelo convite, não daqui.
  const roles = await sql<
    { clinic_id: string; papel: string; clinica_nome: string | null }[]
  >`
    SELECT ur.clinic_id, ur.papel, c.nome AS clinica_nome
    FROM user_role ur
    LEFT JOIN clinic c ON c.id = ur.clinic_id
    WHERE ur.user_id = ${user.id}
  `;

  if (roles.length === 0) {
    console.error(
      "⛔ Usuário sem vínculo com nenhuma clínica — nada foi alterado.\n" +
        "   Este script não concede papel. Use o fluxo de convite da clínica.",
    );
    await sql.end();
    process.exit(1);
  }

  console.log(
    "🏥 Vínculos de clínica/papel:",
    roles.map((r) => ({
      clinic_id: r.clinic_id,
      papel: r.papel,
      clinica: r.clinica_nome,
    })),
  );

  const resultado = await sql.begin(async (tx) => {
    // 1. Marcar e-mail verificado e desabilitar 2FA
    await tx`
      UPDATE app_user
      SET email_verified = true, two_factor_enabled = false
      WHERE id = ${user.id}
    `;

    // 2. Limpar two_factor
    const twoFactorRemovidos = await tx`
      DELETE FROM two_factor
      WHERE user_id = ${user.id}
      RETURNING id
    `;

    // 3. Limpar auth_throttle. Formato real da chave (src/lib/throttle.ts e
    //    chamadores em src/app/(auth)/*/logic.ts): `<fluxo>:email:<email>`
    //    (`cadastro:email:…`, `esqueci-senha:email:…`); as chaves `:ip:` não
    //    são do usuário e ficam. Casamos o SUFIXO exato `:email:<email>`, com
    //    `%`, `_` e `\` do e-mail escapados — `_` cru em LIKE casa qualquer
    //    caractere e apagaria o throttle de um e-mail parecido.
    const emailEscapado = email.replace(/[\\%_]/g, (c) => "\\" + c);
    const throttleRemovidos = await tx`
      DELETE FROM auth_throttle
      WHERE chave LIKE ${"%:email:" + emailEscapado} ESCAPE '\\'
      RETURNING chave
    `;

    // 4. Trilha: um evento por clínica em que o usuário existe. `ator_id`
    //    nulo = ação de script (mesma convenção dos jobs, 0049). O detalhe
    //    não carrega e-mail nem nome — só o que foi feito.
    //    Este INSERT só passa porque a conexão é a de MIGRATION_DATABASE_URL:
    //    a role dona (`iris`, superuser + BYPASSRLS, medido em pg_roles).
    //    `audit_log` é FORCE ROW LEVEL SECURITY e só tem policies para
    //    `app_role` e `iris_auth` (pg_policies) — não existe policy para o
    //    dono; ele simplesmente não passa pela RLS. Com DATABASE_URL
    //    (app_role) sem `app.clinic_id` no contexto, a policy negaria.
    const detalhe = {
      origem: "scripts/unlock-user.ts",
      email_verificado: true,
      two_factor_desativado: true,
      two_factor_removidos: twoFactorRemovidos.length,
      throttle_removidos: throttleRemovidos.length,
    };
    for (const r of roles) {
      await tx`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
        VALUES (
          ${r.clinic_id}, NULL, 'desbloqueio_usuario_script', 'app_user', ${user.id},
          ${tx.json(detalhe)}
        )
      `;
    }

    return {
      twoFactorRemovidos: twoFactorRemovidos.length,
      throttleRemovidos: throttleRemovidos.length,
      auditRegistros: roles.length,
    };
  });

  console.log(
    "✅ email_verified = true, two_factor_enabled = false\n" +
      `✅ Registros de two_factor removidos: ${resultado.twoFactorRemovidos}\n` +
      `✅ Registros de auth_throttle removidos: ${resultado.throttleRemovidos}\n` +
      `📝 audit_log: ${resultado.auditRegistros} registro(s) 'desbloqueio_usuario_script'`,
  );

  await sql.end();
  console.log("🎉 Usuário destravado com sucesso!");
}

main().catch(async (err: unknown) => {
  // Sem `err` inteiro: a message de erro do driver carrega SQL + params (PHI).
  const e = err as { name?: string; code?: string };
  console.error("Erro:", { name: e?.name, code: e?.code });
  await sql.end();
  process.exit(1);
});
