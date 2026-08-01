/**
 * Seed de bootstrap: cria uma clínica + o 1º coordenador (com credencial
 * Better-Auth). Idempotente por nome de clínica e email. Rodar com:
 *   pnpm seed:clinic "Clínica Exemplo" coord@exemplo.test "Senha Forte 123"
 */
import { eq } from "drizzle-orm";
import { authDb, authSql } from "@/db/client";
import { clinic } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

async function main() {
  const [nome, email, senha, nomeCoord = "Coordenador(a)"] =
    process.argv.slice(2);
  if (!nome || !email || !senha) {
    throw new Error('Uso: pnpm seed:clinic "<clínica>" <email> <senha> [nome]');
  }

  const existente = await authDb
    .select()
    .from(clinic)
    .where(eq(clinic.nome, nome))
    .limit(1);
  const c =
    existente.length > 0
      ? existente[0]!
      : (await authDb.insert(clinic).values({ nome }).returning())[0]!;

  const { userId } = await provisionUser({
    email,
    nome: nomeCoord,
    senha,
    clinicId: c.id,
    papel: "coordenador",
    // Provisionamento out-of-band: a conta nasce verificada, senão o
    // requireEmailVerification da Fatia A (#163) tranca o acesso e nenhum
    // e-mail de verificação sai por script.
    emailVerificado: true,
  });

  console.log(
    `Clínica "${nome}" (${c.id}) + coordenador ${email} (${userId}) prontos.`,
  );
  await authSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
