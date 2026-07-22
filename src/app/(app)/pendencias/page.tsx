import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { listarPendencias } from "./queries";
import { PendenciasList } from "./pendencias-list";

/**
 * Fila de pendências do dia: capturas rápidas sem consolidação, extrações
 * que voltaram para reprocessamento, e sugestões da IA aguardando revisão.
 */
export default async function PendenciasPage() {
  const ctx = await getTenantContext();
  const pendencias = await listarPendencias(ctx);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Pendências"
        description={
          pendencias.total === 0
            ? "Nada pendente agora."
            : `${pendencias.total} ${pendencias.total === 1 ? "item pede" : "itens pedem"} atenção.`
        }
      />
      <PendenciasList {...pendencias} />
    </Stack>
  );
}
