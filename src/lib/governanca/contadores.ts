import "server-only";
import type { TenantContext } from "@/db/rls";
import { listarFilaValidacao } from "@/app/(app)/validacao/queries";
import { listarExcecoes } from "@/app/(app)/excecoes/queries";
import { listarSupervisao } from "@/app/(app)/supervisao/queries";
import { listarPendencias } from "@/app/(app)/pendencias/queries";
import { listarAlertasRisco } from "@/app/(app)/alertas-risco/queries";
import type { GovernancaContadores } from "@/components/ui/governanca-nav";

/**
 * Coleta os contadores para as abas da Central de Governança em paralelo.
 * Permite passar valores pré-calculados para evitar re-execução da query da página ativa.
 */
export async function obterContadoresGovernanca(
  ctx: TenantContext,
  predefinidos?: Partial<GovernancaContadores>,
): Promise<GovernancaContadores> {
  const [validacao, excecoes, supervisao, pendencias, alertasRisco] =
    await Promise.all([
      predefinidos?.validacao !== undefined
        ? Promise.resolve(predefinidos.validacao)
        : listarFilaValidacao(ctx)
            .then((r) => r.total)
            .catch(() => 0),
      predefinidos?.excecoes !== undefined
        ? Promise.resolve(predefinidos.excecoes)
        : listarExcecoes(ctx)
            .then((r) => r.total)
            .catch(() => 0),
      predefinidos?.supervisao !== undefined
        ? Promise.resolve(predefinidos.supervisao)
        : listarSupervisao(ctx)
            .then((r) => r.itens.length)
            .catch(() => 0),
      predefinidos?.pendencias !== undefined
        ? Promise.resolve(predefinidos.pendencias)
        : listarPendencias(ctx)
            .then((r) => r.total)
            .catch(() => 0),
      predefinidos?.alertasRisco !== undefined
        ? Promise.resolve(predefinidos.alertasRisco)
        : listarAlertasRisco(ctx)
            .then((r) => r.filter((i) => i.status === "aberto").length)
            .catch(() => 0),
    ]);

  return {
    validacao,
    excecoes,
    supervisao,
    pendencias,
    alertasRisco,
  };
}
