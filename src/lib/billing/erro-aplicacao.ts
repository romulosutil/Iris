import "server-only";
import { and, desc, or, sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { asaasWebhookEvent, billingCycle } from "@/db/schema";

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
 * ## O trilho headless não tem `payment` — e é por isso que a instrução decide
 *
 * A referência resolve o trilho em que o envelope traz o objeto `payment`. O
 * débito mensal do Pix Automático NÃO traz: ele chega como
 * `paymentInstruction`, e `payment.externalReference` é `undefined` nele. Um
 * discriminador que dependa só da referência classifica o débito mensal —
 * exatamente o caminho pelo qual a mensalidade entra — como ruído de ativação.
 *
 * Por isso `classificarFalhaDeConciliacao` testa o **id da instrução primeiro**,
 * fail-closed: instrução existe só dentro da autorização de Pix Automático que
 * nós criamos, logo a cobrança é nossa e a falta de ciclo é ALARME. A prova é
 * por construção e o docblock da função lista o que a torna falsa.
 *
 * MEDIDO (16/08/2026): `BillingProvider.consultarCobranca` devolve
 * `{ status, valorCentavos, motivoRecusa }` e **não expõe** a referência
 * externa — o recurso cru do Asaas tem o campo, a PORTA não. Portanto não há
 * fallback de referência disponível hoje, e inventar um campo na porta é decisão
 * de contrato que esta entrega não tem mandato para tomar.
 *
 * Consequência assumida do que sobra: uma cobrança NOSSA de ciclo que chegue sem
 * referência E sem instrução (trilho `payment`, referência perdida) ainda cai em
 * "fora do ciclo". A evidência crua para desempatar continua existindo em
 * `asaas_webhook_event.payload`, gravado bruto e nunca reescrito.
 *
 * ## `aplicado_em` + `erro_aplicacao` preenchidos é estado LEGÍTIMO
 *
 * As duas colunas respondem perguntas diferentes, e não formam um par
 * sucesso/erro: `aplicado_em` é "não voltar a processar" (único critério de
 * `reprocessarEventosPendentes`, que varre por `aplicado_em IS NULL`), e
 * `erro_aplicacao` é o DIAGNÓSTICO do desfecho — que pode ser esperado e
 * definitivo, como a cobrança de ativação. Carimbado E com motivo é a forma
 * normal de registrar um evento que não tem mais nada a fazer e também não
 * aplicou efeito nenhum.
 *
 * Consequência direta para quem consulta: **"deu errado" NÃO é
 * `erro_aplicacao IS NOT NULL`**, e também NÃO é igualdade com o motivo de
 * alarme. O texto é um carimbo HISTÓRICO — verdade do instante em que foi
 * gravado, nunca reavaliada. A consulta operacional reavalia o estado vivo do
 * `billing_cycle`; ver `listarCobrancasDeCicloNaoConciliadas`.
 *
 * Esta nota mora aqui e no docblock de `marcar` (`route.ts`), e não no
 * comentário de `schema.ts`: o guard `src/db/migrations-vs-main.test.ts` exige
 * snapshot novo de Drizzle para QUALQUER diff em `schema.ts`, comentário
 * incluso, e esta entrega não tem migração.
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
 * É o texto de DIAGNÓSTICO gravado na trilha, não o predicado de busca:
 * `listarCobrancasDeCicloNaoConciliadas` reavalia o estado vivo e nunca filtra
 * por esta constante — ver o docblock daquela função.
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
 * ## Por que a INSTRUÇÃO decide antes da referência (fail-closed)
 *
 * O débito mensal do Pix Automático é headless: o Asaas cria a instrução, debita
 * e notifica. Esses eventos chegam com o objeto `paymentInstruction` e **sem o
 * objeto `payment`** no envelope — logo `payment.externalReference` é
 * `undefined` neles. Classificar por referência sozinha mandaria o débito mensal
 * (o modo de falha que a #289 existe para denunciar) para o balde da ATIVAÇÃO:
 * o alarme calaria justamente no caminho principal do dinheiro.
 *
 * A presença de `providerInstructionId` é prova **por construção** de que a
 * cobrança é nossa: instrução de pagamento só existe dentro de uma autorização
 * de Pix Automático, e a única autorização que este sistema cria é a da
 * mensalidade (`iniciarVinculoPagamento`, `asaas.ts`). Não há instrução de
 * ativação — a cobrança de R$ 0,01 nasce do `immediateQrCode`, que não é
 * instrução (medido na #321).
 *
 * **O que torna essa prova falsa** (e portanto quando esta regra passa a gerar
 * alarme de mentira, sem parar de ser o lado seguro do erro):
 *
 * 1. outra aplicação passar a usar a MESMA conta Asaas com Pix Automático e
 *    apontar para este endpoint — as instruções dela chegariam aqui;
 * 2. este sistema passar a criar autorização de Pix Automático para algo que
 *    não seja a mensalidade (cobrança avulsa recorrente, teste em produção);
 * 3. o Asaas passar a modelar a cobrança de ativação como instrução.
 *
 * Nos três casos o erro é para o lado do alarme, nunca para o lado do silêncio:
 * uma linha a mais para conferir, em vez de dinheiro recebido e não creditado
 * sem registro nenhum. Trocar a ordem destes dois testes reintroduz o defeito.
 *
 * @param referenciaExterna `payment.externalReference` do envelope, como o
 *   normalizador o entregou. `null`/`undefined`/vazio = ausente. Continua sendo
 *   o discriminador do trilho que TEM objeto `payment`.
 * @param providerInstructionId `paymentInstruction.id` do envelope. Presente =
 *   trilho headless do débito mensal = cobrança nossa.
 */
export function classificarFalhaDeConciliacao(
  referenciaExterna: string | null | undefined,
  providerInstructionId?: string | null,
): string {
  if (providerInstructionId?.trim()) {
    return MOTIVO_CICLO_SEM_CICLO_CORRESPONDENTE;
  }
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

/** Uma cobrança nossa que, AGORA, não tem ciclo correspondente. */
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
  /** Id da instrução do Pix Automático, quando o evento é do trilho headless. */
  providerInstructionId: string | null;
  /**
   * O carimbo histórico, se houver. Vem como EVIDÊNCIA, nunca como filtro — é
   * ele que diz se a linha parou por falta de ciclo, por exceção de infra ou se
   * nem chegou a ser processada.
   */
  erroAplicacao: string | null;
  processadoEm: Date;
  aplicadoEm: Date | null;
}

/**
 * Lista as cobranças NOSSAS que, no estado de AGORA, não têm ciclo
 * correspondente (#289, DoD 1) — e só elas.
 *
 * ## Por que esta consulta não lê `erro_aplicacao` (e a versão antiga lia)
 *
 * A primeira versão filtrava `erro_aplicacao = MOTIVO_CICLO_SEM_CICLO_
 * CORRESPONDENTE`, por igualdade. Ler o texto é ler um carimbo HISTÓRICO:
 * verdade do instante em que foi gravado, jamais reavaliada. Dois defeitos
 * medidos vieram daí, e cada um sozinho já invalidava a consulta como oráculo
 * da Definição de Pronto:
 *
 * 1. **Corrida → alarme falso permanente.** `PAYMENT_CREATED` chega em
 *    segundos, e a emissão da cobrança persiste `billing_cycle.
 *    provider_charge_id` logo depois. Se o evento vence a escrita, o webhook
 *    grava o texto de alarme — e continua gravado para sempre, mesmo depois de
 *    o ciclo aparecer e o pagamento ser conciliado normalmente. A #289 já
 *    documenta a corrida gêmea medida em produção (pagamento 1,3 s antes do
 *    primeiro ciclo existir).
 * 2. **Cegueira → alarme que não aparece.** Quando a aplicação falha por
 *    exceção (gateway 500, banco fora), a coluna recebe a MENSAGEM DA EXCEÇÃO,
 *    não o motivo classificado. Uma cobrança nossa nessa situação nunca casava
 *    com a igualdade, e a consulta jurava que estava tudo bem.
 *
 * ## O predicado novo: o mesmo teste do webhook, avaliado AGORA
 *
 * Duas condições, ambas relidas do estado vivo:
 *
 * - **a cobrança é nossa** — id de instrução presente (trilho headless do
 *   débito mensal) OU `externalReference` com um dos nossos prefixos. É o mesmo
 *   fato que `classificarFalhaDeConciliacao` usa, lido do `payload` bruto, que
 *   nunca é reescrito;
 * - **não existe ciclo com aquele `provider_charge_id`** — o predicado literal
 *   de `conciliarPagamentoDeCiclo`, executado no instante da consulta em vez do
 *   instante do webhook. É isto que faz a linha da corrida SUMIR sozinha assim
 *   que o ciclo passa a apontar para a cobrança, sem nenhum reprocessamento.
 *
 * Como o texto saiu do predicado, entram também as linhas que falharam por
 * exceção e as que ainda estão pendentes (`aplicado_em IS NULL`) — as duas
 * classes que a versão antiga não enxergava. `erroAplicacao` e `aplicadoEm`
 * voltam na linha para separar "ainda na fila de retentativa" de "desistiu".
 *
 * O `LIKE` aqui é de PREFIXO sobre a referência (equivalente ao `startsWith` do
 * classificador), nunca substring sobre o texto do motivo: `LIKE '%ciclo%'` em
 * `erro_aplicacao` traria a ativação de volta — o ruído que a issue remove.
 *
 * Roda em `authDb` (`iris_auth`): a role tem `SELECT` em `asaas_webhook_event`
 * (7 colunas, policy `asaas_webhook_event_auth_all`, `USING true`) e é a mesma
 * role com que `conciliarPagamentoDeCiclo` lê `billing_cycle`. Nenhuma migração
 * é necessária.
 *
 * Sem tela nesta entrega: a UI é o D36.
 */
export async function listarCobrancasDeCicloNaoConciliadas(
  limite = 100,
): Promise<CobrancaDeCicloNaoConciliada[]> {
  // O id da cobrança mora em `payment.id` nos eventos de cobrança e em
  // `paymentInstruction.paymentId` nos de instrução — o mesmo `coalesce` que
  // `normalizarEventoAsaas` faz em TypeScript.
  const idCobranca = sql<string | null>`coalesce(
    ${asaasWebhookEvent.payload} #>> '{payment,id}',
    ${asaasWebhookEvent.payload} #>> '{paymentInstruction,paymentId}'
  )`;
  const idInstrucao = sql<
    string | null
  >`${asaasWebhookEvent.payload} #>> '{paymentInstruction,id}'`;
  const referencia = sql<
    string | null
  >`${asaasWebhookEvent.payload} #>> '{payment,externalReference}'`;

  const linhas = await authDb
    .select({
      id: asaasWebhookEvent.id,
      asaasEventId: asaasWebhookEvent.asaasEventId,
      evento: asaasWebhookEvent.evento,
      providerChargeId: idCobranca,
      referenciaExterna: referencia,
      providerInstructionId: idInstrucao,
      erroAplicacao: asaasWebhookEvent.erroAplicacao,
      processadoEm: asaasWebhookEvent.processadoEm,
      aplicadoEm: asaasWebhookEvent.aplicadoEm,
    })
    .from(asaasWebhookEvent)
    .where(
      and(
        // Cobrança nossa, pelos mesmos fatos que o classificador usa.
        or(
          sql`${idInstrucao} IS NOT NULL`,
          sql`${referencia} LIKE ${`${PREFIXO_REFERENCIA_CICLO}%`}`,
          sql`${referencia} LIKE ${`${PREFIXO_REFERENCIA_DEBITO}%`}`,
        ),
        // …e sem ciclo apontando para ela AGORA.
        sql`NOT EXISTS (
          SELECT 1 FROM ${billingCycle}
          WHERE ${billingCycle.providerChargeId} = ${idCobranca}
        )`,
      ),
    )
    .orderBy(desc(asaasWebhookEvent.processadoEm))
    .limit(limite);

  return linhas;
}
