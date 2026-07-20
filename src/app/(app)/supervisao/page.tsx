import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { listarSupervisao } from "./queries";
import { SupervisaoFila } from "./supervisao-fila";

export default async function SupervisaoPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const { itens } = await listarSupervisao(ctx);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Supervisão
        </h1>
        <p className="text-ink text-lg">
          Acompanhamento de estagnação, regressão clínica e faltas excessivas de pacientes.
        </p>
      </Stack>

      <SupervisaoFila itens={itens} />
    </Stack>
  );
}
