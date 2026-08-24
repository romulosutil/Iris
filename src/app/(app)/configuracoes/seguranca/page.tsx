import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import {
  obterStatusMfaEquipe,
  obterLogsAuditoriaClinica,
  obterTermoGovernanca,
} from "./queries";
import { StatusMfaCard } from "./status-mfa-card";
import { AuditLogsCard } from "./audit-logs-card";
import { TermoGovernancaCard } from "./termo-governanca-card";

export default async function SegurancaPage() {
  const ctx = await getTenantContext();

  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const [membrosMfa, logsAuditoria, termoGovernanca] = await Promise.all([
    obterStatusMfaEquipe(ctx),
    obterLogsAuditoriaClinica(ctx, 50),
    obterTermoGovernanca(ctx),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Governança e Segurança da Clínica"
        description="Painel de controle de postura de segurança, autenticação forte, auditoria e declarações de conformidade."
      />

      <StatusMfaCard membros={membrosMfa} />
      <TermoGovernancaCard termo={termoGovernanca} />
      <AuditLogsCard logs={logsAuditoria} />
    </main>
  );
}
