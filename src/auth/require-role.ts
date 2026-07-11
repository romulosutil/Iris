import type { TenantContext, UserRole } from "@/db/rls";

/**
 * Guarda de autorização em nível de aplicação. RLS já isola por tenant/dado;
 * isto restringe uma AÇÃO a papéis específicos (ex.: só coordenador cadastra
 * clínico ou convida). Lança se `ctx.role` não estiver na lista permitida —
 * o chamador decide o tratamento (Server Action retorna erro; página → notFound).
 */
export function requireRole(ctx: TenantContext, ...permitidos: UserRole[]): void {
  if (!permitidos.includes(ctx.role)) {
    throw new Error(
      `Acesso negado: papel "${ctx.role}" não pode executar esta ação (permitido: ${permitidos.join(", ")}).`,
    );
  }
}
