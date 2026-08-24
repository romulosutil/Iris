import { desc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, auditLog, clinic } from "@/db/schema";

export interface StatusMfaMembro {
  userId: string;
  nome: string;
  email: string;
  papel: string;
  mfaAtivo: boolean;
}

export interface RegistroAuditLog {
  id: string;
  acao: string;
  entidade: string;
  entidadeId: string;
  atorNome: string | null;
  atorEmail: string | null;
  criadoEm: Date;
  detalhe: unknown;
}

export interface TermoGovernancaData {
  clinicId: string;
  nomeClinica: string;
  cnpjCpf: string | null;
  geradoEm: Date;
  totemSeguranca: {
    criptografiaRepositorio: string;
    criptografiaTransito: string;
    isolamentoTenant: string;
    cicloBackup: string;
    politicaLlm: string;
    conformidadeLgpd: string;
  };
}

/**
 * Retorna a lista nominal de status de 2FA/MFA da equipe da clínica do coordenador.
 */
export async function obterStatusMfaEquipe(
  ctx: TenantContext,
): Promise<StatusMfaMembro[]> {
  requireRole(ctx, "coordenador");

  return withTenant(ctx, async (tx) => {
    const res = await tx.execute<{
      user_id: string;
      nome: string;
      email: string;
      papel: string;
      mfa_ativo: boolean;
    }>(sql`SELECT user_id, nome, email, papel, mfa_ativo FROM app_obter_status_mfa_equipe()`);

    return res.map((r) => ({
      userId: r.user_id,
      nome: r.nome,
      email: r.email,
      papel: r.papel,
      mfaAtivo: Boolean(r.mfa_ativo),
    }));
  });
}

/**
 * Retorna os logs de auditoria mais recentes da clínica ativa.
 */
export async function obterLogsAuditoriaClinica(
  ctx: TenantContext,
  limite = 50,
): Promise<RegistroAuditLog[]> {
  requireRole(ctx, "coordenador");

  return withTenant(ctx, async (tx) => {
    const linhas = await tx
      .select({
        id: auditLog.id,
        acao: auditLog.acao,
        entidade: auditLog.entidade,
        entidadeId: auditLog.entidadeId,
        atorNome: appUser.name,
        atorEmail: appUser.email,
        criadoEm: auditLog.criadoEm,
        detalhe: auditLog.detalhe,
      })
      .from(auditLog)
      .leftJoin(appUser, eq(auditLog.atorId, appUser.id))
      .where(eq(auditLog.clinicId, ctx.clinicId))
      .orderBy(desc(auditLog.criadoEm))
      .limit(limite);

    return linhas.map((l) => ({
      id: l.id,
      acao: l.acao,
      entidade: l.entidade,
      entidadeId: l.entidadeId,
      atorNome: l.atorNome,
      atorEmail: l.atorEmail,
      criadoEm: l.criadoEm,
      detalhe: l.detalhe,
    }));
  });
}

/**
 * Gera o payload de evidência do Termo de Governança e Criptografia da Clínica.
 */
export async function obterTermoGovernanca(
  ctx: TenantContext,
): Promise<TermoGovernancaData> {
  requireRole(ctx, "coordenador");

  const [dadosClinica] = await withTenant(ctx, (tx) =>
    tx
      .select({
        nome: clinic.nome,
        cpfCnpj: clinic.cpfCnpj,
      })
      .from(clinic)
      .where(eq(clinic.id, ctx.clinicId))
      .limit(1),
  );

  return {
    clinicId: ctx.clinicId,
    nomeClinica: dadosClinica?.nome ?? "Clínica Iris",
    cnpjCpf: dadosClinica?.cpfCnpj ?? null,
    geradoEm: new Date(),
    totemSeguranca: {
      criptografiaRepositorio:
        "AES-256 no banco de dados Postgres e armazenamento de arquivos em repouso",
      criptografiaTransito: "HTTPS / TLS 1.3 obrigatório para todas as conexões",
      isolamentoTenant:
        "Postgres Row Level Security (RLS) multi-tenant isolado por clínica",
      cicloBackup:
        "Backup diário off-site cifrado com retenção auditada de 30 dias (LGPD Art. 46)",
      politicaLlm:
        "Zero Training Policy (modelos de IA não utilizam dados clínicos para treinamento)",
      conformidadeLgpd:
        "Garantia dos Direitos do Titular, Tratamento de Dados Sensíveis e de Menores (Art. 11 e 14)",
    },
  };
}
