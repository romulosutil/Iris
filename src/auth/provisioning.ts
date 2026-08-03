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
  /**
   * Marca a conta como verificada na criação. Só para provisionamento
   * OUT-OF-BAND (scripts de seed), onde quem opera já conhece a pessoa e não
   * existe caixa de entrada no fluxo.
   *
   * Desde a Fatia A (#163) o `emailAndPassword.requireEmailVerification` está
   * ligado, e `signUpEmail` nasce com `email_verified = false`. Sem isto, toda
   * conta criada por `seed:clinic`/`seed:demo` nasce SEM caminho de entrada —
   * o login é recusado e nenhum e-mail de verificação é enviado por script. É
   * o mesmo raciocínio da migração 0059, que fez o backfill das contas
   * pré-existentes no commit que ligou a flag.
   *
   * O cadastro self-service NÃO usa isto: lá a verificação é o controle.
   */
  emailVerificado?: boolean;
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

  // Fora do ramo `isNewUser` de propósito: se o seed morrer entre criar a
  // credencial e marcar a verificação, reexecutar precisa concluir o que
  // faltou. Preso ao ramo "usuário novo", a segunda execução acharia a conta
  // já existente e a deixaria trancada para sempre.
  if (input.emailVerificado) {
    await authDb
      .update(appUser)
      .set({ emailVerified: true })
      .where(eq(appUser.id, userId));
  }

  await authDb
    .insert(userRole)
    .values({ userId, clinicId: input.clinicId, papel: input.papel })
    .onConflictDoNothing();

  return { userId, isNewUser };
}
