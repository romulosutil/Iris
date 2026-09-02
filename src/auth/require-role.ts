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
 * MFA obrigatório não satisfeito por um papel clínico. Subclasse de `RoleError`
 * de propósito: os catches existentes (`err instanceof RoleError` → `{error}`)
 * já tratam graciosamente; a UI de 6.2b refina para redirect ao onboarding MFA.
 */
export class MfaRequiredError extends RoleError {
  constructor() {
    super(
      "MFA obrigatório para papéis clínicos: cadastre o segundo fator antes de continuar.",
    );
    this.name = "MfaRequiredError";
  }
}

/**
 * Fase 6.2 (R6.2.1) — papéis CLÍNICOS (`terapeuta`, `coordenador`) só operam com
 * 2º fator cadastrado; `admin_recepcao` (administrativo) não é exigido. Lança
 * `MfaRequiredError` se um papel clínico não tem MFA. `admin_recepcao` sempre
 * passa. A fonte de `ctx.mfaEnrolled` é plumbada em 6.2b (enrollment Better-Auth)
 * — por isso esta guarda ainda não é chamada em produção (evita travar todos
 * antes de existir caminho de cadastro).
 */
export function requireMfaIfClinicalRole(ctx: TenantContext): void {
  const clinico = ctx.role === "terapeuta" || ctx.role === "coordenador";
  if (clinico && !ctx.mfaEnrolled) {
    throw new MfaRequiredError();
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

/**
 * Guarda das ações do diário de sessão (#506). Aceita `terapeuta` E
 * `coordenador` — quem restringe a ESCRITA ao profissional que atendeu não é
 * esta guarda, e sim a RLS: `session_note_insert`/`session_note_update`
 * (migração `0006_fase2_rls.sql`, reescritas na `0142`) e `audio_update`
 * exigem `app_session_profissional_responsavel(session_id)` — titular OU
 * substituto designado na agenda (#539). Coordenador só escreve no diário
 * das sessões em que ELE é o profissional responsável.
 *
 * Motivo de aceitar coordenador: `criarClinicaEVinculo`
 * (`src/auth/cadastro.ts`) concede só `coordenador` ao fundador, e
 * `papelAtivo` (`src/auth/papel-ativo.ts`) faz `coordenador` vencer sempre —
 * então numa clínica de um terapeuta só NENHUMA ação do diário tinha caminho
 * de escrita, nem depois de o fundador se auto-conceder `terapeuta`. A agenda
 * já trata coordenador como profissional que atende
 * (`validarTerapeutaDaClinica` aceita `["terapeuta", "coordenador"]`), então o
 * diário era o único módulo fora dessa régua.
 */
export function requireDiario(ctx: TenantContext): void {
  requireRole(ctx, "terapeuta", "coordenador");
}
