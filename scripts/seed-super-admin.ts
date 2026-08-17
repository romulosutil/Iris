import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, clinic } from "@/db/schema";
import { auth } from "@/auth/auth";

export const SUPER_ADMIN_EMAIL = "superadmin@iris.test";
export const SUPER_ADMIN_SENHA = "SenhaSuperAdmin123!";

async function seedSuperAdmin() {
  console.log("Iniciando seed de Super Admin...");

  const [existente] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, SUPER_ADMIN_EMAIL))
    .limit(1);

  let userId: string;

  if (existente) {
    userId = existente.id;
    console.log(
      `Usuário ${SUPER_ADMIN_EMAIL} já existente. Atualizando flag is_super_admin...`,
    );
  } else {
    console.log(`Criando conta para ${SUPER_ADMIN_EMAIL}...`);
    const created = await auth.api.signUpEmail({
      body: {
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_SENHA,
        name: "Super Admin Platform",
      },
    });
    userId = created.user.id;
  }

  await authDb
    .update(appUser)
    .set({
      isSuperAdmin: true,
      emailVerified: true,
    })
    .where(eq(appUser.id, userId));

  console.log("----------------------------------------");
  console.log("✅ Super Admin configurado com sucesso!");
  console.log(`URL do Backoffice: /benjamin`);
  console.log(`E-mail: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Senha: ${SUPER_ADMIN_SENHA}`);
  console.log("----------------------------------------");
}

seedSuperAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro ao configurar Super Admin:", err);
    process.exit(1);
  });
