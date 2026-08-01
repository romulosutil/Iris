import "server-only";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, userRole } from "@/db/schema";
import { auth } from "@/auth/auth";
import type { Papel } from "@/auth/papel-ativo";

export type ProvisionInput = {
  email: string;
  nome: string;
  senha: string;
  clinicId: string;
  papel: Papel;
};

/**
 * Provisiona um usuário numa clínica (seed inicial e, na Fase 1c, convite).
 * A6: upsert por email — email já existente recebe novo user_role sem duplicar
 * app_user. Escreve via authDb (iris_auth). Não há UI de convite na Fase 1b.
 */
export async function provisionUser(
  input: ProvisionInput,
): Promise<{ userId: string; isNewUser: boolean }> {
  const existente = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, input.email))
    .limit(1);

  let userId: string;
  let isNewUser = false;
  if (existente.length > 0) {
    userId = existente[0]!.id;
  } else {
    // Cria a credencial pelo Better-Auth (hash de senha + auth_account).
    const created = await auth.api.signUpEmail({
      body: { email: input.email, password: input.senha, name: input.nome },
    });
    userId = created.user.id;
    isNewUser = true;
  }

  await authDb
    .insert(userRole)
    .values({ userId, clinicId: input.clinicId, papel: input.papel })
    .onConflictDoNothing();

  return { userId, isNewUser };
}
