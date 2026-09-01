import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { listarSupervisao } from "./queries";
import { SupervisaoFila } from "./supervisao-fila";

export default async function SupervisaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const { itens } = await listarSupervisao(ctx);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Supervisão & Estagnação"
        description="Acompanhamento de estagnação, regressão clínica e faltas excessivas de pacientes."
      />
      <SupervisaoFila itens={itens} />
    </Stack>
  );
}
