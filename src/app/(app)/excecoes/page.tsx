import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { obterContadoresGovernanca } from "@/lib/governanca/contadores";
import { listarExcecoes } from "./queries";
import { ExcecoesList } from "./excecoes-list";

/**
 * Painel de exceções do coordenador (Fase 3 Plano 3). Coordenador-only.
 */
export default async function ExcecoesPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const [excecoes, contadores] = await Promise.all([
    listarExcecoes(ctx),
    obterContadoresGovernanca(ctx),
  ]);

  return (
    <Stack gap="lg">
      <GovernancaNav contadores={{ ...contadores, excecoes: excecoes.total }} />
      <PageHeader
        title="Exceções Clínicas"
        description="Acompanhamento de interrupções de fluxo e inconsistências no atendimento."
      />
      <ExcecoesList {...excecoes} userId={ctx.userId} />
    </Stack>
  );
}
