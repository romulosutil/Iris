import "server-only";
import { desc, ne } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { billingCycle, billingCycleStatus } from "@/db/schema";

export type CicloStatus = (typeof billingCycleStatus.enumValues)[number];

/**
 * Uma linha do histórico de cobranças, do jeito que a tela precisa.
 *
 * Todas as colunas saem do `select` tipado do Drizzle, e não de `sql` cru: em
 * template `sql<Date>` o driver devolve **string** e o `Date` só existe no tipo
 * — o formatador da tela quebraria em runtime com o typecheck verde.
 */
export interface CicloDoHistorico {
  id: string;
  inicio: Date;
  fim: Date;
  status: CicloStatus;
  pacientesContados: number;
  valorCentavos: number;
  vencimentoCobranca: Date | null;
  cobradoEm: Date | null;
}

/**
 * 12 ≈ um ano de ciclos mensais: cabe numa tela sem paginar para a esmagadora
 * maioria, e o `offset` existe para quem passar disso.
 */
export const LIMITE_PADRAO_HISTORICO = 12;

/**
 * Histórico de cobranças da clínica corrente (#36, bloco A1).
 *
 * ## Por que `status <> 'aberto'`
 *
 * Ciclo `aberto` é o ciclo CORRENTE — ainda não apurado, com
 * `pacientes_contados = 0` e `valor_centavos = 0` por construção. Listá-lo aqui
 * o renderizaria ao lado das cobranças reais como se fosse uma fatura de
 * R$ 0,00. O ciclo corrente é assunto do cartão do bloco B, que mostra
 * projeção, não fatura.
 *
 * ## Ordenação e paginação
 *
 * `fim DESC` serve o índice `billing_cycle_clinic_fim_idx` (clinic_id, fim
 * DESC). O desempate por `id DESC` não é cosmético: sem ele, dois ciclos com o
 * mesmo `fim` sairiam em ordem arbitrária e uma linha poderia aparecer nas duas
 * páginas — ou em nenhuma.
 *
 * A leitura sai por `withTenant` (`app_role`, RLS ativa). `billing_cycle` tem
 * `GRANT SELECT` de tabela desde a `0071:237` e a policy `billing_cycle_select`
 * resolve o tenant por `app_clinic_id_exigido()` (`0085:140`) — o filtro por
 * clínica é do BANCO, e o predicado abaixo não o repete de propósito: duplicá-lo
 * criaria uma segunda fonte de verdade sobre isolamento que poderia divergir da
 * policy sem ninguém notar.
 */
export async function listarCiclosDaClinica(
  ctx: TenantContext,
  opcoes?: { limite?: number; offset?: number },
): Promise<CicloDoHistorico[]> {
  const limite = opcoes?.limite ?? LIMITE_PADRAO_HISTORICO;
  const offset = opcoes?.offset ?? 0;

  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: billingCycle.id,
        inicio: billingCycle.inicio,
        fim: billingCycle.fim,
        status: billingCycle.status,
        pacientesContados: billingCycle.pacientesContados,
        valorCentavos: billingCycle.valorCentavos,
        vencimentoCobranca: billingCycle.vencimentoCobranca,
        cobradoEm: billingCycle.cobradoEm,
      })
      .from(billingCycle)
      .where(ne(billingCycle.status, "aberto"))
      .orderBy(desc(billingCycle.fim), desc(billingCycle.id))
      .limit(limite)
      .offset(offset),
  );
}
