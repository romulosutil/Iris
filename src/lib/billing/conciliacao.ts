import { and, desc, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { billingCycle, subscription } from "@/db/schema";
import { AsaasProvider } from "@/lib/billing/provider";
import {
  BillingProviderError,
  type StatusAssinaturaProvider,
  type StatusCobranca,
} from "@/lib/billing/provider/types";

/**
 * Conciliação de billing (#375) — comparação SOMENTE LEITURA entre o estado
 * local (`billing_cycle` / `subscription`) e o estado real no gateway.
 *
 * Nada aqui escreve. Nem no banco, nem no Asaas. O motivo não é preguiça: a
 * correção de uma divergência de faturamento é irreversível na maioria dos
 * ramos (emitir cobrança, revogar autorização de Pix Automático), e um
 * relatório que se auto-corrige é um segundo caminho de emissão convivendo com
 * `fecharCiclosVencendo` — sem a idempotência que o UNIQUE parcial de
 * `provider_charge_id` dá àquele. O que sai daqui é diagnóstico; a reação está
 * escrita em `infra/billing/runbook.md`.
 */

/** O que o gateway respondeu sobre UMA cobrança, já normalizado. */
export type EstadoRemotoCobranca =
  | { encontrada: true; status: StatusCobranca; valorCentavos: number }
  | { encontrada: false };

export type ClasseDivergenciaCiclo =
  /** O gateway não conhece o `provider_charge_id` que gravamos (404). */
  | "cobranca_inexistente_no_gateway"
  /** Pago no gateway, ciclo não fechado aqui — webhook perdido. */
  | "pagamento_nao_conciliado"
  /** Recusado no gateway, ciclo ainda esperando pagamento aqui. */
  | "recusa_nao_aplicada"
  /** Estornado no gateway; o ciclo não tem estado que represente isso. */
  | "estorno_nao_tratado"
  /** Ciclo `pago` aqui sem pagamento correspondente lá. */
  | "pago_sem_lastro"
  /** Mesmo status, valores diferentes. */
  | "valor_divergente";

export interface EntradaClassificacaoCiclo {
  statusLocal: string;
  valorLocalCentavos: number;
  /**
   * `true` quando OUTROS ciclos apontam para este via `debito_agrupado_em`
   * (#290): a cobrança da âncora carrega a soma da dívida, não o
   * `valor_centavos` desta linha. Comparar valor aqui acusaria divergência em
   * todo agrupamento — o status continua sendo conferido normalmente.
   */
  agrupaDebito: boolean;
  remoto: EstadoRemotoCobranca;
}

/**
 * A ORDEM dos ramos é a regra, não um detalhe de escrita:
 *
 * 1. "o gateway não conhece a cobrança" invalida qualquer outra leitura;
 * 2. estorno antes de `pago_sem_lastro`, porque estorno é o diagnóstico
 *    específico do mesmo sintoma genérico (pago aqui, não pago lá) e é o único
 *    que muda a reação do operador — há dinheiro a devolver ou já devolvido;
 * 3. valor por último, porque só faz sentido perguntar sobre valor quando os
 *    status já concordam.
 */
export function classificarDivergenciaCiclo(
  entrada: EntradaClassificacaoCiclo,
): ClasseDivergenciaCiclo | null {
  const { statusLocal, valorLocalCentavos, agrupaDebito, remoto } = entrada;

  if (!remoto.encontrada) return "cobranca_inexistente_no_gateway";

  if (remoto.status === "estornada") return "estorno_nao_tratado";

  if (statusLocal === "pago") {
    return remoto.status === "paga" ? null : "pago_sem_lastro";
  }

  if (remoto.status === "paga") return "pagamento_nao_conciliado";

  if (remoto.status === "recusada") {
    // `falhou` é justamente o estado que registra a recusa: concordam.
    return statusLocal === "falhou" ? null : "recusa_nao_aplicada";
  }

  // Status remoto `pendente` daqui para baixo. Só resta conferir valor.
  if (agrupaDebito) return null;
  if (remoto.valorCentavos !== valorLocalCentavos) return "valor_divergente";

  return null;
}

export type ClasseDivergenciaVinculo =
  | "vinculo_cancelado_no_gateway"
  | "vinculo_pausado_no_gateway"
  | "ativacao_nao_aplicada"
  | "vinculo_nao_autorizado";

/**
 * `statusLocal` é `subscription.status` como texto — `free_tier` e `canceled`
 * não chegam aqui porque a varredura não os seleciona (o primeiro não tem
 * vínculo; o segundo é terminal e concordar com um gateway que também cancelou
 * é o esperado).
 */
export function classificarDivergenciaVinculo(
  statusLocal: string,
  statusRemoto: StatusAssinaturaProvider,
): ClasseDivergenciaVinculo | null {
  if (statusRemoto === "cancelada") return "vinculo_cancelado_no_gateway";

  if (statusLocal === "setup_pending") {
    return statusRemoto === "autorizada" ? "ativacao_nao_aplicada" : null;
  }

  // `active` e `past_due` daqui para baixo: os dois exigem autorização viva.
  if (statusRemoto === "pausada") return "vinculo_pausado_no_gateway";
  if (statusRemoto === "pendente") return "vinculo_nao_autorizado";

  return null;
}

/**
 * Teto por passada. Cada ciclo conferido é UMA chamada HTTP ao Asaas: varredura
 * sem teto é rate limit garantido no dia em que a base crescer. 100 é a mesma
 * ordem de grandeza dos demais tetos do módulo (20 por passada nas varreduras
 * que ESCREVEM; aqui pode ser maior porque nada é irreversível).
 *
 * Truncamento NUNCA é silencioso: `truncado` sobe no relatório e o operador
 * roda de novo. Um teto que não se anuncia lê-se como "conferi tudo".
 */
export const TETO_CONCILIACAO_POR_PASSADA = 100;

/**
 * Janela padrão de conferência, em dias, contada de `cobranca_emitida_em`.
 * Conciliação é diagnóstico do presente: reconferir cobrança de um ano atrás
 * gasta chamada de API para reafirmar o que já foi conciliado.
 */
export const JANELA_CONCILIACAO_DIAS = 60;

export interface ProvedorDeConsulta {
  consultarCobranca(
    id: string,
  ): Promise<{ status: StatusCobranca; valorCentavos: number }>;
  consultarVinculo(id: string): Promise<{ status: StatusAssinaturaProvider }>;
}

export interface DivergenciaCiclo {
  cicloId: string;
  clinicId: string;
  providerChargeId: string;
  statusLocal: string;
  statusRemoto: string | null;
  valorLocalCentavos: number;
  valorRemotoCentavos: number | null;
  classe: ClasseDivergenciaCiclo;
}

export interface FalhaConsultaCiclo {
  cicloId: string;
  providerChargeId: string;
  erro: string;
}

export interface ResultadoConciliacaoCiclos {
  conferidos: number;
  divergencias: DivergenciaCiclo[];
  falhas: FalhaConsultaCiclo[];
  truncado: boolean;
}

export async function conciliarCiclos(opcoes?: {
  limite?: number;
  janelaDias?: number;
  provider?: ProvedorDeConsulta;
}): Promise<ResultadoConciliacaoCiclos> {
  const limite = opcoes?.limite ?? TETO_CONCILIACAO_POR_PASSADA;
  const janelaDias = opcoes?.janelaDias ?? JANELA_CONCILIACAO_DIAS;
  // `AsaasProvider` direto, não `getBillingProvider()`: conciliar é conferir o
  // que já foi emitido, e qual gateway está ATIVO na env hoje não muda quem
  // emitiu a cobrança de ontem.
  const provider = opcoes?.provider ?? new AsaasProvider();

  /**
   * TODO filtro vai no WHERE, nunca depois do LIMIT. Uma linha inelegível que
   * entra pelo LIMIT e é descartada em JS gasta uma vaga do teto e, numa base
   * grande, faz a varredura relatar "conferi 100" tendo conferido 3.
   */
  const linhas = await authDb
    .select({
      cicloId: billingCycle.id,
      clinicId: billingCycle.clinicId,
      statusLocal: billingCycle.status,
      valorLocalCentavos: billingCycle.valorCentavos,
      providerChargeId: billingCycle.providerChargeId,
      // `billing_cycle.id` cru (não `${billingCycle.id}`): dentro da
      // subconsulta correlacionada, o helper de coluna do Drizzle emite só
      // `"id"` sem qualificar a tabela — e essa referência bare resolve para
      // o escopo mais interno (`filho`), não para a linha externa. O `EXISTS`
      // virava sempre falso (comparava `filho.debito_agrupado_em` com o
      // próprio `filho.id`), escondendo todo agrupamento de débito.
      agrupaDebito: sql<boolean>`EXISTS (
        SELECT 1 FROM ${billingCycle} AS filho
        WHERE filho.debito_agrupado_em = billing_cycle.id
      )`,
    })
    .from(billingCycle)
    .where(
      and(
        isNotNull(billingCycle.providerChargeId),
        ne(billingCycle.status, "aberto"),
        sql`${billingCycle.cobrancaEmitidaEm} >= now() - make_interval(days => ${janelaDias})`,
      ),
    )
    .orderBy(desc(billingCycle.cobrancaEmitidaEm))
    // +1 para SABER que há fila atrás sem uma segunda consulta de contagem.
    .limit(limite + 1);

  const truncado = linhas.length > limite;
  const lote = truncado ? linhas.slice(0, limite) : linhas;

  const divergencias: DivergenciaCiclo[] = [];
  const falhas: FalhaConsultaCiclo[] = [];

  for (const linha of lote) {
    const providerChargeId = linha.providerChargeId!;
    let remoto: EstadoRemotoCobranca;
    try {
      const atual = await provider.consultarCobranca(providerChargeId);
      remoto = {
        encontrada: true,
        status: atual.status,
        valorCentavos: atual.valorCentavos,
      };
    } catch (err) {
      // 404 é RESPOSTA, não falha: significa que o gateway não conhece o id que
      // gravamos, e isso é a divergência mais grave da lista. Qualquer outro
      // erro é falha de consulta — não sabemos nada sobre aquele ciclo, e
      // afirmar divergência aqui seria diagnóstico inventado.
      if (err instanceof BillingProviderError && err.status === 404) {
        remoto = { encontrada: false };
      } else {
        falhas.push({
          cicloId: linha.cicloId,
          providerChargeId,
          erro: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    const classe = classificarDivergenciaCiclo({
      statusLocal: linha.statusLocal,
      valorLocalCentavos: linha.valorLocalCentavos,
      agrupaDebito: linha.agrupaDebito,
      remoto,
    });
    if (!classe) continue;

    divergencias.push({
      cicloId: linha.cicloId,
      clinicId: linha.clinicId,
      providerChargeId,
      statusLocal: linha.statusLocal,
      statusRemoto: remoto.encontrada ? remoto.status : null,
      valorLocalCentavos: linha.valorLocalCentavos,
      valorRemotoCentavos: remoto.encontrada ? remoto.valorCentavos : null,
      classe,
    });
  }

  return { conferidos: lote.length, divergencias, falhas, truncado };
}

export interface DivergenciaVinculo {
  subscriptionId: string;
  clinicId: string;
  providerSubscriptionId: string;
  statusLocal: string;
  statusRemoto: string;
  classe: ClasseDivergenciaVinculo;
}

export interface FalhaConsultaVinculo {
  subscriptionId: string;
  providerSubscriptionId: string;
  erro: string;
}

export interface ResultadoConciliacaoVinculos {
  conferidos: number;
  divergencias: DivergenciaVinculo[];
  falhas: FalhaConsultaVinculo[];
  truncado: boolean;
}

/**
 * Só `setup_pending`, `active` e `past_due` entram: `free_tier` não tem vínculo
 * nenhum (e é por isso que `provider` é NULLABLE sem default, D29/#36), e
 * `canceled` é terminal — concordar com um gateway que também cancelou é o
 * esperado, e discordar dele não tem reação operacional definida.
 *
 * O 404 aqui NÃO é tratado como resposta, ao contrário da cobrança: um vínculo
 * que o gateway não conhece não distingue "revogado e expurgado" de "id errado
 * gravado", e as duas reações são opostas. Fica como falha de consulta, para o
 * operador olhar.
 */
export async function conciliarVinculos(opcoes?: {
  limite?: number;
  provider?: ProvedorDeConsulta;
}): Promise<ResultadoConciliacaoVinculos> {
  const limite = opcoes?.limite ?? TETO_CONCILIACAO_POR_PASSADA;
  const provider = opcoes?.provider ?? new AsaasProvider();

  const linhas = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      statusLocal: subscription.status,
      providerSubscriptionId: subscription.providerSubscriptionId,
    })
    .from(subscription)
    .where(
      and(
        isNotNull(subscription.providerSubscriptionId),
        inArray(subscription.status, ["setup_pending", "active", "past_due"]),
      ),
    )
    .orderBy(desc(subscription.atualizadoEm))
    .limit(limite + 1);

  const truncado = linhas.length > limite;
  const lote = truncado ? linhas.slice(0, limite) : linhas;

  const divergencias: DivergenciaVinculo[] = [];
  const falhas: FalhaConsultaVinculo[] = [];

  for (const linha of lote) {
    const providerSubscriptionId = linha.providerSubscriptionId!;
    let statusRemoto: StatusAssinaturaProvider;
    try {
      statusRemoto = (await provider.consultarVinculo(providerSubscriptionId))
        .status;
    } catch (err) {
      falhas.push({
        subscriptionId: linha.subscriptionId,
        providerSubscriptionId,
        erro: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const classe = classificarDivergenciaVinculo(
      linha.statusLocal,
      statusRemoto,
    );
    if (!classe) continue;

    divergencias.push({
      subscriptionId: linha.subscriptionId,
      clinicId: linha.clinicId,
      providerSubscriptionId,
      statusLocal: linha.statusLocal,
      statusRemoto,
      classe,
    });
  }

  return { conferidos: lote.length, divergencias, falhas, truncado };
}
