import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { obterContadoresGovernanca } from "@/lib/governanca/contadores";
import { listarSupervisao } from "./queries";
import { SupervisaoFila } from "./supervisao-fila";

export default async function SupervisaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const [{ itens }, contadores] = await Promise.all([
    listarSupervisao(ctx),
    obterContadoresGovernanca(ctx),
  ]);

  return (
    <Stack gap="lg">
      <GovernancaNav contadores={{ ...contadores, supervisao: itens.length }} />
      <PageHeader
        title="Supervisão & Estagnação"
        description="Acompanhamento de estagnação, regressão clínica e faltas excessivas de pacientes."
      />
      <SupervisaoFila itens={itens} />
    </Stack>
  );
}
