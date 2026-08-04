import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser } from "@/db/schema";
import { auth } from "@/auth/auth";

export interface SuperAdminContext {
  userId: string;
  email: string;
}

/**
 * Verifica se um usuário possui o flag de Super Admin (`is_super_admin` = true).
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  const [row] = await authDb
    .select({ isSuperAdmin: appUser.isSuperAdmin })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  return row?.isSuperAdmin === true;
}

/**
 * Guarda de rota e Server Action para o módulo `/benjamin/*` (#184).
 *
 * Em caso de usuário não autenticado ou usuário autenticado sem `is_super_admin = true`,
 * lança `notFound()` (404 Not Found) para simular que a rota não existe,
 * dificultando a varredura, enumeração e ataques de força bruta contra a sessão de Super Admin.
 */
export async function exigirSuperAdmin(): Promise<SuperAdminContext> {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId || !email) {
    notFound();
  }

  const superAdmin = await isSuperAdmin(userId);
  if (!superAdmin) {
    notFound();
  }

  return { userId, email };
}
