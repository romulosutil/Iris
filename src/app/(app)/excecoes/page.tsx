import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { listarExcecoes } from "./queries";
import { ExcecoesList } from "./excecoes-list";

/**
 * Painel de exceções do coordenador (Fase 3 Plano 3). Coordenador-only.
 */
export default async function ExcecoesPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const excecoes = await listarExcecoes(ctx);

  return (
    <Stack gap="lg">
      <GovernancaNav />
      <PageHeader
        title="Exceções Clínicas"
        description={
          excecoes.total === 0
            ? "Nada represado — clínica em dia."
            : `${excecoes.total} ${excecoes.total === 1 ? "item pede" : "itens pedem"} acompanhamento.`
        }
      />
      <ExcecoesList {...excecoes} />
    </Stack>
  );
}

