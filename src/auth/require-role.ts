import type { TenantContext, UserRole } from "@/db/rls";

/**
 * Erro de autorização de papel. Tipado (e não um `Error` genérico) para que o
 * chamador distinga "papel não permitido" de uma falha sistêmica (banco fora,
 * bug) — sem isto, um catch amplo mascararia qualquer exceção como "sem
 * permissão" e esconderia o problema real.
 */
export class RoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleError";
  }
}

/**
 * Guarda de autorização em nível de aplicação. RLS já isola por tenant/dado;
 * isto restringe uma AÇÃO a papéis específicos (ex.: só recepção/coordenação
 * agenda uma sessão). Lança `RoleError` se `ctx.role` não estiver na lista
 * permitida — o chamador decide o tratamento (Server Action retorna erro;
 * página → notFound).
 */
export function requireRole(
  ctx: TenantContext,
  ...permitidos: UserRole[]
): void {
  if (!permitidos.includes(ctx.role)) {
    throw new RoleError(
      `Acesso negado: papel "${ctx.role}" não pode executar esta ação (permitido: ${permitidos.join(", ")}).`,
    );
  }
}

/**
 * Guarda para as ações de agendar/ler do fluxo `/agenda/semana` (etapa E):
 * coordenador e recepção (`admin_recepcao`) podem agendar — só as ações
 * estruturais (encerrar regra, editar regra, config de disponibilidade)
 * seguem coordenador-only via `requireRole`.
 */
export function requireAgendar(ctx: TenantContext): void {
  requireRole(ctx, "coordenador", "admin_recepcao");
}
