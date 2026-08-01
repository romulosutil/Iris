/**
 * Seed: cria clínica solo + usuário Lorena (terapeuta + coordenador)
 * Uso: pnpm seed:lorena
 */
import { eq } from "drizzle-orm";
import { authDb, authSql } from "@/db/client";
import { clinic, userRole } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";
import { randomBytes } from "crypto";

async function main() {
  const nomeClinica = "Consultório Lorena Pereira";
  const email = "lorenapereira02@outlook.com";
  const nome = "Lorena Pereira";

  // Gerar password temporário (16 chars base64)
  const senhaTemp = randomBytes(12).toString("base64").slice(0, 16);

  // Criar clínica (idempotente por nome)
  const existente = await authDb
    .select()
    .from(clinic)
    .where(eq(clinic.nome, nomeClinica))
    .limit(1);
  const c =
    existente.length > 0
      ? existente[0]!
      : (await authDb.insert(clinic).values({ nome: nomeClinica }).returning())[0]!;

  // Provisionar user com papel coordenador
  const { userId } = await provisionUser({
    email,
    nome,
    senha: senhaTemp,
    clinicId: c.id,
    papel: "coordenador",
    // Provisionamento out-of-band: a conta nasce verificada, senão o
    // requireEmailVerification da Fatia A (#163) tranca o acesso e nenhum
    // e-mail de verificação sai por script.
    emailVerificado: true,
  });

  // Adicionar papel terapeuta
  await authDb
    .insert(userRole)
    .values({ userId, clinicId: c.id, papel: "terapeuta" })
    .onConflictDoNothing();

  console.log(`
✅ Clínica "${nomeClinica}" (${c.id}) + Lorena (${userId}) prontos.
📧 Email: ${email}
🔐 Senha temporária: ${senhaTemp}
⚠️  Compartilhar com Lorena. Atualizar no primeiro login.
  `);

  await authSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
