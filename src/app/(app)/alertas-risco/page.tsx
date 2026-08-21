import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { GovernancaNav } from "@/components/ui/governanca-nav";
import { obterContadoresGovernanca } from "@/lib/governanca/contadores";
import { listarAlertasRisco } from "./queries";
import { FilaRisco } from "./fila-risco";

/**
 * #122 — fila dedicada de alerta de risco clínico.
 *
 * SEM `requireRole`: a policy `alerta_risco_scope` (migração 0049) já decide
 * quem enxerga cada linha. O terapeuta da sessão PRECISA ver o alerta dele —
 * travar a rota em coordenador faria o profissional que está com o caso na mão
 * não conseguir reconhecer, e reconhecer é o que para o escalonamento (§4.2).
 */
export default async function AlertasRiscoPage() {
  const ctx = await getTenantContext();
  const [itens, contadores] = await Promise.all([
    listarAlertasRisco(ctx),
    ctx.role === "coordenador"
      ? obterContadoresGovernanca(ctx)
      : Promise.resolve(undefined),
  ]);

  const aguardando = itens.filter((i) => i.status === "aberto").length;

  return (
    <Stack gap="lg">
      <GovernancaNav
        contadores={
          contadores
            ? { ...contadores, alertasRisco: aguardando }
            : { alertasRisco: aguardando }
        }
      />
      <PageHeader
        title="Alertas de risco"
        description={
          aguardando === 0
            ? "Nenhum sinal aguardando reconhecimento no momento."
            : aguardando === 1
              ? "1 sinal aguardando reconhecimento."
              : `${aguardando} sinais aguardando reconhecimento.`
        }
      />
      <FilaRisco itens={itens} />
    </Stack>
  );
}
