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
   */
  emailVerificado?: boolean;
  /** Instância de banco customizada (ex.: ownerDb nos scripts de seed). */
  db?: any;
  /** Headers HTTP da requisição atual para repassar ao Better-Auth em server-side calls. */
  headers?: Headers;
};

/**
 * Provisiona um usuário numa clínica (seed inicial e, na Fase 1c, convite).
 * A6: upsert por email — email já existente recebe novo user_role sem duplicar
 * app_user. Escreve via authDb (iris_auth). Não há UI de convite na Fase 1b.
 */
export async function provisionUser(
  input: ProvisionInput,
): Promise<{ userId: string; isNewUser: boolean }> {
  const db = input.db ?? authDb;
  const existente = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, input.email))
    .limit(1);

  let userId: string;
  let isNewUser = false;
  if (existente.length > 0) {
    userId = existente[0]!.id;
  } else {
    let reqHeaders = input.headers;
    if (!reqHeaders) {
      try {
        const { headers: getHeaders } = await import("next/headers");
        reqHeaders = await getHeaders();
      } catch {
        // Fora de escopo de requisição HTTP (ex.: script de seed)
      }
    }

    // Cria a credencial pelo Better-Auth (hash de senha + auth_account).
    const created = await auth.api.signUpEmail({
      body: { email: input.email, password: input.senha, name: input.nome },
      ...(reqHeaders ? { headers: reqHeaders } : {}),
    });
    userId = created.user.id;
    isNewUser = true;
  }

  // Fora do ramo `isNewUser` de propósito: se o seed morrer entre criar a
  // credencial e marcar a verificação, reexecutar precisa concluir o que
  // faltou. Preso ao ramo "usuário novo", a segunda execução acharia a conta
  // já existente e a deixaria trancada para sempre.
  if (input.emailVerificado) {
    await db
      .update(appUser)
      .set({ emailVerified: true })
      .where(eq(appUser.id, userId));
  }

  if (input.clinicId) {
    await db
      .insert(userRole)
      .values({ userId, clinicId: input.clinicId, papel: input.papel })
      .onConflictDoNothing();
  }

  return { userId, isNewUser };
}
