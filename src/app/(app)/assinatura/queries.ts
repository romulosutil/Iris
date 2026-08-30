import "server-only";
import { desc, eq, ne } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  billingCycle,
  billingCycleStatus,
  clinic,
  subscription,
  subscriptionStatus,
} from "@/db/schema";

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
  /**
   * Fatura hospedada desta cobrança (#36, A4). `null` é caso legítimo, não
   * falha: ciclo em `devido` nunca teve cobrança emitida, e a emissão pode ter
   * respondido sem URL.
   */
  invoiceUrl: string | null;
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
        invoiceUrl: billingCycle.invoiceUrl,
      })
      .from(billingCycle)
      .where(ne(billingCycle.status, "aberto"))
      .orderBy(desc(billingCycle.fim), desc(billingCycle.id))
      .limit(limite)
      .offset(offset),
  );
}

export type AssinaturaStatus = (typeof subscriptionStatus.enumValues)[number];

/**
 * Estado corrente do vínculo de cobrança (#36, bloco B).
 *
 * `null` quando a clínica ainda não tem linha de `subscription` — quem nunca
 * clicou em "ativar". É estado legítimo do produto, não falha de leitura, e por
 * isso não lança: a tela renderiza o caminho de quem ainda vai contratar.
 *
 * Por que uma consulta nova em vez de estender `SituacaoConta`:
 * `avaliarSituacaoConta` é o caminho quente de TODA escrita do produto — ela
 * decide se um INSERT pode acontecer. Pendurar campos de renderização nela
 * colocaria peso de tela no caminho de decisão de escrita.
 */
export interface CicloCorrente {
  statusAssinatura: AssinaturaStatus;
  /**
   * Fronteiras do ciclo corrente. `null` até a primeira ativação abrir ciclo.
   *
   * `cicloAtualFim` é a data do PRÓXIMO FECHAMENTO, e é ela — não o `fim` do
   * `billing_cycle` aberto — que decide quando a fatura nasce:
   * `fecharCiclosVencendo` varre por `subscription.ciclo_atual_fim <= agora`
   * (`subscription.ts:658`), servido pelo índice `subscription_renovacao_idx`.
   * As duas datas devem coincidir; renderizar a outra seria mostrar na tela uma
   * data que o job não consulta.
   */
  cicloAtualInicio: Date | null;
  cicloAtualFim: Date | null;
  ativadaEm: Date | null;
  canceladaEm: Date | null;
  /** Instante do carimbo de inadimplência: é dele que a carência corre. */
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo da carência é contado em dias CIVIS. */
  timezone: string;
}

/**
 * Leitura do vínculo corrente por `withTenant` (`app_role`, RLS ativa).
 *
 * `subscription` tem `GRANT SELECT` de tabela desde a `0071:235` — de tabela, e
 * não de coluna, então alcança coluna adicionada depois — e a policy
 * `subscription_select` resolve o tenant por `app_clinic_id_exigido()`
 * (`0085:289`). O `JOIN clinic` sai pelo mesmo caminho que `obterRecusaAtiva`
 * já usa (`recusa-ativa.ts:62`).
 *
 * Sem `where` de clínica de propósito: o filtro é do BANCO. Repeti-lo aqui
 * criaria uma segunda fonte de verdade sobre isolamento, que poderia divergir
 * da policy sem ninguém notar — mesmo argumento de `listarCiclosDaClinica`.
 * `subscription.clinic_id` é `UNIQUE`, então sob a policy sobra no máximo uma
 * linha e o `limit(1)` é redundância barata, não desempate.
 */
export async function obterCicloCorrente(
  ctx: TenantContext,
): Promise<CicloCorrente | null> {
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .select({
        statusAssinatura: subscription.status,
        cicloAtualInicio: subscription.cicloAtualInicio,
        cicloAtualFim: subscription.cicloAtualFim,
        ativadaEm: subscription.ativadaEm,
        canceladaEm: subscription.canceladaEm,
        pastDueDesde: subscription.pastDueDesde,
        carenciaDias: subscription.carenciaDias,
        timezone: clinic.timezone,
      })
      .from(subscription)
      .innerJoin(clinic, eq(clinic.id, subscription.clinicId))
      .limit(1),
  );

  return linhas[0] ?? null;
}
