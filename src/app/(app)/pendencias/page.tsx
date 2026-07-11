import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { listarPendencias } from "./queries";
import { PendenciasList } from "./pendencias-list";

/**
 * Fila de pendências do dia: capturas rápidas sem consolidação, extrações
 * que voltaram para reprocessamento, e sugestões da IA aguardando revisão. A
 * página só resolve o tenant e busca os dados — o desenho da lista (inclusive
 * o estado vazio "dia limpo") vive em `PendenciasList`, presentacional.
 */
export default async function PendenciasPage() {
  const ctx = await getTenantContext();
  const pendencias = await listarPendencias(ctx);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Pendências
        </h1>
        <p className="text-ink text-lg">
          {pendencias.total === 0
            ? "Nada pendente agora."
            : `${pendencias.total} ${pendencias.total === 1 ? "item pede" : "itens pedem"} atenção.`}
        </p>
      </Stack>

      <PendenciasList {...pendencias} />
    </Stack>
  );
}
