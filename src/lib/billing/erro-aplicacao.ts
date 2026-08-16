import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { asaasWebhookEvent } from "@/db/schema";

/**
 * Motivos de `asaas_webhook_event.erro_aplicacao` — vocabulário fechado, num
 * lugar só (#289).
 *
 * ## O defeito que isto mata
 *
 * Até aqui a rota do webhook gravava
 * `erro_aplicacao = "cobrança sem ciclo correspondente"` para TODO evento de
 * cobrança em que `conciliarPagamentoDeCiclo` devolvia `false`. Esse `false`
 * cobre dois desfechos OPOSTOS:
 *
 * - a cobrança de **ativação** do Pix Automático, que nunca tem ciclo e nunca
 *   terá — acontece em toda ativação, para sempre, e é o comportamento correto;
 * - a **mensalidade paga sem ciclo conciliado**, que é dinheiro recebido e não
 *   creditado.
 *
 * Um texto só para os dois torna a coluna inútil como sinal: quem varre a
 * tabela encontra o alarme afogado no ruído da ativação, e a única saída é
 * conferir evento por evento no payload bruto.
 *
 * ## O discriminador é a NOSSA `externalReference`
 *
 * Não um identificador do gateway. A referência externa é fato sobre **o que
 * nós emitimos**, medido dos dois lados e sem coluna nova:
 *
 * - cobrança de ciclo sai com `cycle:<id>` (`subscription.ts`);
 * - cobrança consolidada de débito sai com `debito:<âncora>` (`debito.ts`);
 * - a cobrança de ATIVAÇÃO nasce do `immediateQrCode` da autorização, que **não
 *   aceita `externalReference`** (medido na #321, sandbox, e visível no corpo
 *   que `asaas.ts` monta) — ela chega sem referência **por construção**.
 *
 * `clinic:<id>` NÃO entra na lista: é a referência do CLIENTE (customer), não
 * de cobrança, e nunca aparece em `payment.externalReference`.
 *
 * ## Fail-open: de onde vem a referência, e o que acontece se ela faltar
 *
 * A classificação lê a referência do **envelope do evento**
 * (`payment.externalReference`, normalizado em `EventoWebhookNormalizado`).
 *
 * MEDIDO (16/08/2026): `BillingProvider.consultarCobranca` devolve
 * `{ status, valorCentavos, motivoRecusa }` e **não expõe** a referência
 * externa — o recurso cru do Asaas tem o campo, a PORTA não. Portanto não há
 * fallback disponível hoje, e inventar um campo na porta é decisão de contrato
 * que esta entrega não tem mandato para tomar.
 *
 * Consequência assumida, escrita aqui porque é onde ela é lida: se um dia uma
 * cobrança NOSSA de ciclo chegar ao webhook sem `externalReference` no
 * envelope, ela será classificada como "fora do ciclo" e o alarme não aparece.
 * A evidência crua para desempatar continua existindo em
 * `asaas_webhook_event.payload`, que é gravado bruto e nunca é reescrito.
 */

/** Prefixo da referência externa de uma cobrança de CICLO (`cycle:<id>`). */
export const PREFIXO_REFERENCIA_CICLO = "cycle:";

/**
 * Prefixo da referência externa da cobrança consolidada de DÉBITO
 * (`debito:<âncora>`). Também é cobrança nossa, e também deveria casar com um
 * ciclo — por isso divide o desfecho de alarme com `cycle:`.
 */
export const PREFIXO_REFERENCIA_DEBITO = "debito:";

/**
 * ALARME. Cobrança que nós emitimos contra um ciclo, e o ciclo não foi
 * encontrado por `provider_charge_id`. É o único desfecho em que a ausência de
 * ciclo pode significar dinheiro recebido e não conciliado.
 *
 * É por IGUALDADE com esta constante que `listarCobrancasDeCicloNaoConciliadas`
 * varre a tabela — nunca por `LIKE`/substring.
 */
export const MOTIVO_CICLO_SEM_CICLO_CORRESPONDENTE =
  "cobrança de ciclo sem ciclo correspondente";

/**
 * ESPERADO. Cobrança sem referência externa nenhuma: é a ativação do Pix
 * Automático (que não aceita o campo) ou uma cobrança avulsa criada fora do
 * fluxo de ciclos. Não ter ciclo é o comportamento correto, não uma falha.
 */
export const MOTIVO_COBRANCA_FORA_DO_CICLO =
  "cobrança fora do ciclo (ativação ou avulsa)";

/**
 * ESPERADO, mas por outro motivo. Cobrança COM referência externa cujo prefixo
 * não é nosso: outra aplicação apontada para o mesmo endpoint, ou cobrança
 * criada à mão no painel do Asaas com referência própria.
 *
 * Texto PRÓPRIO, e não o de `MOTIVO_COBRANCA_FORA_DO_CICLO`, por duas razões
 * medidas:
 *
 * 1. Dizer "ativação ou avulsa" numa cobrança que traz
 *    `externalReference: "pedido-4711"` é afirmação falsa gravada na trilha —
 *    o operador que ler a coluna procura no lugar errado.
 * 2. Os dois casos não são o mesmo estado a jusante: `normalizarEventoAsaas`
 *    trata QUALQUER referência não-vazia como cobrança nossa
 *    (`asaas.ts`), então o caso 3 vira `cobranca.*` e dispara
 *    `avisarRecusaQueNaoConciliou`, enquanto o caso 2 vira `pagamento.*` e não
 *    dispara. Colapsar os textos apagaria qual dos dois aconteceu.
 */
export const MOTIVO_COBRANCA_DE_TERCEIRO =
  "cobrança fora do ciclo (referência externa de terceiro)";

/**
 * Evento de vínculo cujo `provider_subscription_id` não casa com assinatura
 * nenhuma: evento de outra aplicação, ou evento de elegibilidade da conta.
 */
export const MOTIVO_ASSINATURA_DESCONHECIDA = "assinatura desconhecida";

/**
 * Evento sem id de cobrança e sem id de vínculo: não há o que aplicar.
 *
 * Texto ÚNICO de propósito. A rota gravava `"evento sem id utilizável"` e a
 * varredura `"sem id utilizável"` — duas cópias do mesmo desfecho que já
 * divergiram, exatamente o que o módulo compartilhado existe para impedir.
 */
export const MOTIVO_EVENTO_SEM_ID = "evento sem id utilizável";

/**
 * Traduz "a conciliação não achou ciclo" no motivo que descreve o desfecho.
 *
 * Função ÚNICA e pura, consumida pelos dois caminhos que gravam a coluna: a
 * rota `POST /api/hooks/asaas` e `reprocessarEventosPendentes`. Duas cópias
 * derivam — ver `MOTIVO_EVENTO_SEM_ID`.
 *
 * @param referenciaExterna `payment.externalReference` do envelope, como o
 *   normalizador o entregou. `null`/`undefined`/vazio = ausente.
 */
export function classificarFalhaDeConciliacao(
  referenciaExterna: string | null | undefined,
): string {
  const referencia = referenciaExterna?.trim();
  if (!referencia) return MOTIVO_COBRANCA_FORA_DO_CICLO;
  if (
    referencia.startsWith(PREFIXO_REFERENCIA_CICLO) ||
    referencia.startsWith(PREFIXO_REFERENCIA_DEBITO)
  ) {
    return MOTIVO_CICLO_SEM_CICLO_CORRESPONDENTE;
  }
  return MOTIVO_COBRANCA_DE_TERCEIRO;
}

/** Uma cobrança de ciclo que chegou ao webhook e não achou ciclo. */
export interface CobrancaDeCicloNaoConciliada {
  /** PK do evento em `asaas_webhook_event`. */
  id: string;
  /** Id do evento no Asaas (`evt_<hex>&<n>`), para busca no painel. */
  asaasEventId: string;
  /** Nome do evento do gateway (`PAYMENT_RECEIVED`, …). */
  evento: string;
  /** Id da cobrança no gateway — é por ele que se acha o dinheiro. */
  providerChargeId: string | null;
  /** A referência que nós emitimos (`cycle:<id>` / `debito:<âncora>`). */
  referenciaExterna: string | null;
  processadoEm: Date;
  aplicadoEm: Date | null;
}

/**
 * Lista as cobranças de ciclo que o webhook não conseguiu conciliar (#289,
 * DoD 1) — e SÓ elas.
 *
 * O filtro é `erro_aplicacao = MOTIVO_CICLO_SEM_CICLO_CORRESPONDENTE`, por
 * IGUALDADE. Nunca `LIKE`/substring: os três motivos de cobrança compartilham
 * palavras de propósito (são o mesmo assunto), e um `LIKE '%ciclo%'` traria a
 * ativação de volta — o ruído que a issue existe para remover.
 *
 * Roda em `authDb` (`iris_auth`), a única role com grant nesta tabela. Grants
 * medidos em 16/08/2026 contra o Postgres local: `SELECT` concedido em todas as
 * 7 colunas, RLS ligada com policy `asaas_webhook_event_auth_all` (`USING
 * true`) para `iris_auth`. Nenhuma migração é necessária.
 *
 * Sem tela nesta entrega: a UI é o D36.
 */
export async function listarCobrancasDeCicloNaoConciliadas(
  limite = 100,
): Promise<CobrancaDeCicloNaoConciliada[]> {
  const linhas = await authDb
    .select({
      id: asaasWebhookEvent.id,
      asaasEventId: asaasWebhookEvent.asaasEventId,
      evento: asaasWebhookEvent.evento,
      // O id da cobrança mora em `payment.id` nos eventos de cobrança e em
      // `paymentInstruction.paymentId` nos de instrução — o mesmo `coalesce`
      // que `normalizarEventoAsaas` faz em TypeScript.
      providerChargeId: sql<string | null>`coalesce(
        ${asaasWebhookEvent.payload} #>> '{payment,id}',
        ${asaasWebhookEvent.payload} #>> '{paymentInstruction,paymentId}'
      )`,
      referenciaExterna: sql<
        string | null
      >`${asaasWebhookEvent.payload} #>> '{payment,externalReference}'`,
      processadoEm: asaasWebhookEvent.processadoEm,
      aplicadoEm: asaasWebhookEvent.aplicadoEm,
    })
    .from(asaasWebhookEvent)
    .where(
      eq(
        asaasWebhookEvent.erroAplicacao,
        MOTIVO_CICLO_SEM_CICLO_CORRESPONDENTE,
      ),
    )
    .orderBy(desc(asaasWebhookEvent.processadoEm))
    .limit(limite);

  return linhas;
}
