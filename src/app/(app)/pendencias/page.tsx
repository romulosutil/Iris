import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { obterContadoresGovernanca } from "@/lib/governanca/contadores";
import { listarPendencias } from "./queries";
import { PendenciasList } from "./pendencias-list";

/**
 * Fila de pendências do dia: capturas rápidas sem consolidação, extrações
 * que voltaram para reprocessamento, e sugestões da IA aguardando revisão.
 */
export default async function PendenciasPage() {
  const ctx = await getTenantContext();
  const [pendencias, contadores] = await Promise.all([
    listarPendencias(ctx),
    ctx.role === "coordenador"
      ? obterContadoresGovernanca(ctx)
      : Promise.resolve(undefined),
  ]);

  return (
    <Stack gap="lg">
      {ctx.role === "coordenador" ? (
        <GovernancaNav
          contadores={
            contadores
              ? { ...contadores, pendencias: pendencias.total }
              : undefined
          }
        />
      ) : null}
      <PageHeader
        title="Pendências Gerais"
        description={
          pendencias.total === 0
            ? undefined
            : `${pendencias.total} ${pendencias.total === 1 ? "item pede" : "itens pedem"} atenção.`
        }
      />
      <PendenciasList {...pendencias} />
    </Stack>
  );
}
