import { sql } from "drizzle-orm";
import { db } from "./client";

export type UserRole = "terapeuta" | "coordenador" | "admin_recepcao";

export type TenantContext = {
  clinicId: string;
  userId: string;
  role: UserRole;
};

// Transação Drizzle com o schema tipado.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * GARGALO ÚNICO de acesso a dado de paciente. Abre uma transação, seta o
 * contexto de tenant como GUCs locais (`app.clinic_id/user_id/user_role`) — que
 * as políticas RLS leem via `current_setting()` — e roda `fn` dentro dela.
 * Nenhuma query de produto deve tocar o banco fora daqui.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  // Falha rápido: strings vazias/undefined viram `invalid input syntax for
  // type uuid` obscuro lá no Postgres. Melhor estourar aqui, no ponto de erro.
  if (!ctx.clinicId || !ctx.userId || !ctx.role) {
    throw new Error(
      "withTenant: contexto de tenant incompleto (clinicId, userId e role são obrigatórios)",
    );
  }
  return db.transaction(async (tx) => {
    // is_local = true → equivalente a SET LOCAL (vale só nesta transação).
    await tx.execute(sql`select
      set_config('app.clinic_id', ${ctx.clinicId}, true),
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.user_role', ${ctx.role}, true)`);
    return fn(tx);
  });
}
