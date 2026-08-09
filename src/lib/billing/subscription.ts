import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { billingCycle, subscription } from "@/db/schema";
import { calcularMensalidadeCentavos } from "./calculator";
import {
  BillingProviderError,
  getBillingProvider,
  type MetodoPagamento,
  type StatusAssinaturaProvider,
  type StatusCobranca,
} from "./provider";

/**
 * Estado da assinatura e do ciclo de faturamento (#36, revisto em #163).
 *
 * Tudo aqui roda em `authDb` — a conexão da role `iris_auth`, sem GUC de
 * tenant. Não é atalho: o webhook chega do gateway, não de uma sessão de
 * usuário, então não existe tenant para `withTenant` estabelecer. E o job de
 * fechamento varre TODAS as clínicas, o que é justamente o que `withTenant`
 * proíbe. A contrapartida é que `iris_auth` não tem grant em `patient` — a
 * apuração passa obrigatoriamente pela função `billing_apurar_ciclo`
 * (SECURITY DEFINER, migrações 0071/0075), que devolve contagem, nunca dado
 * clínico.
 *
 * ## O trilho é PÓS-PAGO
 *
 * ```
 * ativação (registra meio de pagamento, NÃO cobra)
 *    ↓
 * webhook autoriza → status active → abre o 1º ciclo
 *    ↓
 * fim do ciclo → billing_apurar_ciclo → status 'apurado'
 *    ↓
 * emitirCobrancaDeCiclo (valor REAL apurado) → 'aguardando_pagamento'
 *    ↓
 * webhook de pagamento → 'pago'   |   recusa/vencimento → 'falhou' → past_due
 * ```
 *
 * **Regra inegociável: `pago` só pelo webhook.** A versão anterior carimbava o
 * ciclo como `cobrado` no instante em que ajustava o valor da recorrência no
 * gateway — nenhuma cobrança tinha sido emitida nem confirmada, e o
 * `billing_cycle`, que é o memorial auditável da fatura, afirmava um fato que
 * não aconteceu.
 */

/** Ciclo padrão. Fica na coluna `subscription.ciclo_dias` por clínica. */
const CICLO_DIAS_PADRAO = 30;

/**
 * Prazo de vencimento da cobrança emitida no fechamento, em dias.
 * Esgotado sem pagamento, o ciclo vai a `falhou` e a assinatura a `past_due`,
 * onde a carência (`subscription.carencia_dias`) começa a correr.
 */
const DIAS_VENCIMENTO_COBRANCA = 5;

/**
 * Antecedência da apuração: **zero**, e é o ponto do trilho pós-pago.
 *
 * Era 3. A apuração rodava 3 dias ANTES de `cicloAtualFim`, mas
 * `billing_apurar_ciclo` conta o intervalo `[inicio, fim)` INTEIRO: paciente
 * cadastrado nos dias 28-30 não existia no momento da apuração, o ciclo era
 * marcado e nunca reapurado — subfaturamento recorrente e invisível. A
 * antecedência só fazia sentido enquanto o trilho era recorrente e o valor
 * precisava chegar ao gateway antes de ele disparar o débito. Emitindo a
 * cobrança nós mesmos, no fechamento, ela deixa de ter razão de existir.
 *
 * Mantida como constante exportada (em vez de sumir) porque é referenciada em
 * teste e o zero explícito documenta a decisão melhor que a ausência.
 */
export const DIAS_ANTECEDENCIA_APURACAO = 0;

function somarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Traduz o status do vínculo no gateway para o estado interno.
 *
 * `pendente` NÃO vira `free_tier`: um vínculo que já existe no gateway e
 * aguarda autorização é `setup_pending`. Voltar para `free_tier` faria a conta
 * regredir de estado com uma autorização em voo.
 */
function estadoInterno(
  statusProvider: StatusAssinaturaProvider,
): "setup_pending" | "active" | "past_due" | "canceled" {
  switch (statusProvider) {
    case "autorizada":
      return "active";
    case "pausada":
      return "past_due";
    case "cancelada":
      return "canceled";
    case "pendente":
      return "setup_pending";
  }
}

export interface PedidoAtivacao {
  clinicId: string;
  nomeClinica: string;
  emailResponsavel: string;
  cpfCnpj?: string;
  metodo: MetodoPagamento;
  urlRetorno: string;
}

export interface ResultadoAtivacao {
  checkoutUrl: string;
  providerSubscriptionId: string;
}

/**
 * Registra o meio de pagamento da clínica. **Não cobra nada.**
 *
 * Antes, esta função criava no gateway uma recorrência de valor FIXO
 * `calcularMensalidadeCentavos(1)` = R$ 39 — o que é pré-pago: a clínica
 * entrava numa cobrança antes de usar um ciclo sequer. Com a cobrança avulsa
 * no fechamento, o problema "a recorrência nasce com valor de 1 paciente"
 * simplesmente deixa de existir, e `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` sai deste
 * caminho.
 *
 * O paciente NÃO é criado aqui, e o status NÃO vai para `active` aqui — quem
 * promove para `active` é o webhook, depois da confirmação do banco. Confiar no
 * retorno do checkout seria confiar no navegador do cliente: a URL de retorno é
 * navegável à mão.
 *
 * Idempotente por clínica: se já existe vínculo pendente, devolve o checkout
 * existente em vez de criar um segundo no gateway — dois cliques no botão não
 * viram dois vínculos.
 */
export async function iniciarAtivacao(
  pedido: PedidoAtivacao,
): Promise<ResultadoAtivacao> {
  const provider = getBillingProvider();

  const [existente] = await authDb
    .select()
    .from(subscription)
    .where(eq(subscription.clinicId, pedido.clinicId))
    .limit(1);

  if (
    existente?.providerSubscriptionId &&
    existente.status === "setup_pending"
  ) {
    const atual = await provider.consultarVinculo(
      existente.providerSubscriptionId,
    );
    // Só reaproveita enquanto continua pendente no gateway. Se já autorizou,
    // cair aqui significa que o webhook atrasou; aplicar o efeito agora é
    // melhor que devolver um checkout de algo já resolvido.
    if (atual.status === "pendente") {
      return {
        checkoutUrl: existente.checkoutUrl ?? "",
        providerSubscriptionId: existente.providerSubscriptionId,
      };
    }
    await aplicarStatusProvider(existente.providerSubscriptionId, atual.status);
  }

  const criado = await provider.iniciarVinculoPagamento({
    assinante: {
      clinicId: pedido.clinicId,
      nomeClinica: pedido.nomeClinica,
      emailResponsavel: pedido.emailResponsavel,
      cpfCnpj: pedido.cpfCnpj,
    },
    metodo: pedido.metodo,
    urlRetorno: pedido.urlRetorno,
    referenciaExterna: `clinic:${pedido.clinicId}`,
  });

  await authDb
    .insert(subscription)
    .values({
      clinicId: pedido.clinicId,
      status: "setup_pending",
      provider: provider.id,
      providerSubscriptionId: criado.providerVinculoId,
      // Coluna própria (0075). Antes o checkout era guardado em
      // `provider_customer_id`, que significa outra coisa.
      checkoutUrl: criado.checkoutUrl,
      metodoPagamento: pedido.metodo,
      cicloDias: CICLO_DIAS_PADRAO,
    })
    .onConflictDoUpdate({
      target: subscription.clinicId,
      set: {
        status: "setup_pending",
        provider: provider.id,
        providerSubscriptionId: criado.providerVinculoId,
        checkoutUrl: criado.checkoutUrl,
        metodoPagamento: pedido.metodo,
        atualizadoEm: new Date(),
      },
    });

  return {
    checkoutUrl: criado.checkoutUrl,
    providerSubscriptionId: criado.providerVinculoId,
  };
}

/**
 * Aplica ao estado local o status do vínculo observado no gateway.
 *
 * Recebe o status CONSULTADO, não o inferido do payload do webhook: a
 * notificação do Mercado Pago frequentemente traz só `{type, action, data:{id}}`,
 * sem estado nenhum. Decidir transição a partir do tipo do evento seria decidir
 * a partir de dado que o gateway não mandou.
 *
 * Retorna `true` se alguma linha mudou — `false` significa vínculo desconhecido
 * (evento de outra conta, ou reentrega após cancelamento).
 */
export async function aplicarStatusProvider(
  providerSubscriptionId: string,
  statusProvider: StatusAssinaturaProvider,
): Promise<boolean> {
  const novo = estadoInterno(statusProvider);
  const agora = new Date();

  const [linha] = await authDb
    .select()
    .from(subscription)
    .where(eq(subscription.providerSubscriptionId, providerSubscriptionId))
    .limit(1);

  if (!linha) return false;

  const virandoAtiva = novo === "active" && linha.status !== "active";

  await authDb
    .update(subscription)
    .set({
      status: novo,
      atualizadoEm: agora,
      ativadaEm: virandoAtiva ? (linha.ativadaEm ?? agora) : linha.ativadaEm,
      canceladaEm:
        novo === "canceled" ? (linha.canceladaEm ?? agora) : linha.canceladaEm,
      // `past_due_desde` só é carimbado na ENTRADA em past_due. Recarimbar a
      // cada reentrega do mesmo evento zeraria a carência para sempre e a
      // assinatura nunca venceria.
      pastDueDesde: novo === "past_due" ? (linha.pastDueDesde ?? agora) : null,
      // A ativação abre o primeiro ciclo, e é a partir DELE que pacientes
      // contam para faturamento. Nada do período de teste entra em fatura por
      // construção: não existe `billing_cycle` antes deste ponto, e o ciclo
      // começa em `agora`, sem retroagir.
      cicloAtualInicio: virandoAtiva ? agora : linha.cicloAtualInicio,
      cicloAtualFim: virandoAtiva
        ? somarDias(agora, linha.cicloDias)
        : linha.cicloAtualFim,
    })
    .where(eq(subscription.id, linha.id));

  if (virandoAtiva) {
    await abrirCiclo(
      linha.id,
      linha.clinicId,
      agora,
      somarDias(agora, linha.cicloDias),
    );
  }

  return true;
}

/**
 * Abre um ciclo. O UNIQUE `(clinic_id, inicio)` é a barreira contra ciclo
 * duplicado: `onConflictDoNothing` transforma uma reentrega de webhook num
 * no-op em vez de numa segunda fatura no mesmo mês.
 */
async function abrirCiclo(
  subscriptionId: string,
  clinicId: string,
  inicio: Date,
  fim: Date,
): Promise<void> {
  await authDb
    .insert(billingCycle)
    .values({ subscriptionId, clinicId, inicio, fim, status: "aberto" })
    .onConflictDoNothing();
}

export interface ResultadoFechamento {
  clinicId: string;
  cycleId: string;
  fichasContadas: number;
  valorCentavos: number;
  /** `true` quando uma cobrança foi efetivamente emitida no gateway. */
  cobrancaEmitida: boolean;
  providerChargeId?: string;
  erro?: string;
}

/**
 * Fechamento de ciclo: apura, calcula o valor consolidado e **emite a cobrança
 * do ciclo que acabou**, com o valor realmente apurado.
 *
 * Roda quando o ciclo já venceu (`cicloAtualFim <= agora`) — não antes. Ver
 * `DIAS_ANTECEDENCIA_APURACAO`.
 *
 * Uma clínica que falha NÃO derruba a varredura das outras — o erro é
 * persistido em `billing_cycle.erro` e a função segue. Um `throw` aqui faria a
 * primeira clínica com problema de rede impedir o faturamento de todas as
 * seguintes.
 *
 * Ciclo de valor zero não gera cobrança: com o critério "criou ou interagiu",
 * clínica em recesso apura 0 paciente e a fatura é R$ 0,00. Mandar uma cobrança
 * de zero ao gateway é erro garantido; o ciclo é fechado direto como `pago`.
 */
export async function fecharCiclosVencendo(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoFechamento[]> {
  const agora = opcoes?.agora ?? new Date();
  const dryRun = opcoes?.dryRun ?? false;
  const provider = getBillingProvider();

  const vencendo = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      providerSubscriptionId: subscription.providerSubscriptionId,
      cicloInicio: subscription.cicloAtualInicio,
      cicloFim: subscription.cicloAtualFim,
      cicloDias: subscription.cicloDias,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.status, "active"),
        lte(subscription.cicloAtualFim, agora),
      ),
    );

  const resultados: ResultadoFechamento[] = [];

  for (const assinatura of vencendo) {
    if (!assinatura.cicloInicio || !assinatura.cicloFim) continue;

    try {
      // Localiza (ou reabre) o ciclo vigente. `onConflictDoNothing` no abrir
      // torna a reexecução do job inofensiva.
      await abrirCiclo(
        assinatura.subscriptionId,
        assinatura.clinicId,
        assinatura.cicloInicio,
        assinatura.cicloFim,
      );

      const [ciclo] = await authDb
        .select({
          id: billingCycle.id,
          providerChargeId: billingCycle.providerChargeId,
        })
        .from(billingCycle)
        .where(
          and(
            eq(billingCycle.clinicId, assinatura.clinicId),
            eq(billingCycle.inicio, assinatura.cicloInicio),
          ),
        )
        .limit(1);

      if (!ciclo) {
        throw new Error("ciclo vigente não encontrado após abertura");
      }

      // A contagem vem do banco (SECURITY DEFINER); o PREÇO vem do TypeScript.
      // Separação deliberada: preço em SQL viraria uma segunda tabela de faixas
      // impossível de manter sincronizada com a calculadora.
      const apuracao = await authDb.execute<{ total: number }>(
        sql`SELECT billing_apurar_ciclo(${ciclo.id}::uuid) AS total`,
      );
      const fichasContadas =
        (apuracao as unknown as { total: number }[])[0]?.total ?? 0;
      const valorCentavos = calcularMensalidadeCentavos(fichasContadas);

      let cobrancaEmitida = false;
      let providerChargeId = ciclo.providerChargeId ?? undefined;

      if (!dryRun) {
        await authDb
          .update(billingCycle)
          .set({ valorCentavos, erro: null })
          .where(eq(billingCycle.id, ciclo.id));

        if (valorCentavos === 0) {
          await authDb
            .update(billingCycle)
            .set({ status: "pago", cobradoEm: new Date() })
            .where(eq(billingCycle.id, ciclo.id));
        } else if (ciclo.providerChargeId) {
          // Guarda de idempotência própria da EMISSÃO: o UNIQUE
          // `(clinic_id, inicio)` protege o ciclo, não a cobrança. Sem isto,
          // uma reexecução do job depois de uma falha parcial emitiria uma
          // segunda cobrança para o mesmo ciclo.
        } else if (assinatura.providerSubscriptionId) {
          const cobranca = await provider.emitirCobrancaDeCiclo({
            vinculoId: assinatura.providerSubscriptionId,
            valorCentavos,
            referenciaExterna: `cycle:${ciclo.id}`,
            descricao: `Iris — ficha(s) ativa(s) no ciclo encerrado em ${assinatura.cicloFim.toISOString().slice(0, 10)}`,
            vencimento: somarDias(agora, DIAS_VENCIMENTO_COBRANCA),
          });
          providerChargeId = cobranca.providerChargeId;
          cobrancaEmitida = true;
          await authDb
            .update(billingCycle)
            .set({
              providerChargeId: cobranca.providerChargeId,
              cobrancaEmitidaEm: new Date(),
              // NÃO é `pago`. Quem confirma é o webhook — este estado diz
              // exatamente o que aconteceu: a cobrança saiu, o dinheiro não
              // chegou.
              status:
                cobranca.status === "paga" ? "pago" : "aguardando_pagamento",
              cobradoEm: cobranca.status === "paga" ? new Date() : null,
            })
            .where(eq(billingCycle.id, ciclo.id));
        } else {
          throw new Error(
            "assinatura ativa sem vínculo de pagamento no gateway",
          );
        }

        // O ciclo seguinte começa onde este termina — encadear pelo `fim`
        // anterior, não por `now()`, evita que a data de renovação derive
        // alguns minutos a cada mês.
        const proximoInicio = assinatura.cicloFim;
        const proximoFim = somarDias(proximoInicio, assinatura.cicloDias);
        await authDb
          .update(subscription)
          .set({
            cicloAtualInicio: proximoInicio,
            cicloAtualFim: proximoFim,
            atualizadoEm: new Date(),
          })
          .where(eq(subscription.id, assinatura.subscriptionId));
        await abrirCiclo(
          assinatura.subscriptionId,
          assinatura.clinicId,
          proximoInicio,
          proximoFim,
        );
      }

      resultados.push({
        clinicId: assinatura.clinicId,
        cycleId: ciclo.id,
        fichasContadas,
        valorCentavos,
        cobrancaEmitida,
        providerChargeId,
      });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      resultados.push({
        clinicId: assinatura.clinicId,
        cycleId: "",
        fichasContadas: 0,
        valorCentavos: 0,
        cobrancaEmitida: false,
        erro,
      });
    }
  }

  return resultados;
}

/**
 * Reconcilia o pagamento de um ciclo a partir do webhook. É a peça que não
 * existia: o vínculo é identificado por um id que não diz respeito a ciclo
 * nenhum, então sem `provider_charge_id` não havia como saber QUAL fatura foi
 * paga.
 *
 * `past_due` finalmente ganha caminho produtor real: cobrança de ciclo recusada
 * ou vencida carimba `past_due` + `pastDueDesde`, e a carência
 * (`subscription.carencia_dias`) leva a `canceled` a partir daí.
 *
 * Retorna `false` quando a cobrança não pertence a nenhum ciclo conhecido —
 * evento de outra conta, ou reentrega depois de um expurgo.
 */
export async function conciliarPagamentoDeCiclo(
  providerChargeId: string,
  status: StatusCobranca,
): Promise<boolean> {
  const agora = new Date();

  const [ciclo] = await authDb
    .select({
      id: billingCycle.id,
      subscriptionId: billingCycle.subscriptionId,
      status: billingCycle.status,
    })
    .from(billingCycle)
    .where(eq(billingCycle.providerChargeId, providerChargeId))
    .limit(1);

  if (!ciclo) return false;

  if (status === "paga") {
    await authDb
      .update(billingCycle)
      .set({ status: "pago", cobradoEm: agora, erro: null })
      .where(eq(billingCycle.id, ciclo.id));

    // Pagamento em dia tira a assinatura de `past_due` — e só o pagamento faz
    // isso. `pastDueDesde` volta a NULL para que uma inadimplência futura
    // recomece a carência do zero.
    await authDb
      .update(subscription)
      .set({ status: "active", pastDueDesde: null, atualizadoEm: agora })
      .where(
        and(
          eq(subscription.id, ciclo.subscriptionId),
          eq(subscription.status, "past_due"),
        ),
      );
    return true;
  }

  if (status === "recusada") {
    await authDb
      .update(billingCycle)
      .set({ status: "falhou", erro: "cobrança recusada pelo gateway" })
      .where(eq(billingCycle.id, ciclo.id));

    const [assinatura] = await authDb
      .select({ id: subscription.id, pastDueDesde: subscription.pastDueDesde })
      .from(subscription)
      .where(eq(subscription.id, ciclo.subscriptionId))
      .limit(1);

    if (assinatura) {
      await authDb
        .update(subscription)
        .set({
          status: "past_due",
          // Só na ENTRADA: recarimbar a cada reentrega zeraria a carência para
          // sempre e a assinatura nunca venceria.
          pastDueDesde: assinatura.pastDueDesde ?? agora,
          atualizadoEm: agora,
        })
        .where(eq(subscription.id, assinatura.id));
    }
    return true;
  }

  // `estornada` e `pendente` não movem a assinatura: estorno é decisão
  // comercial que precisa de tratamento humano, e pendente é o estado em que a
  // cobrança já está.
  return true;
}

/**
 * Reprocessa webhooks recebidos e ainda não aplicados. Existe porque a rota do
 * webhook grava e responde 200 rápido (o Mercado Pago desabilita endpoint
 * lento) — se a aplicação do efeito falhar depois do 200, o gateway não
 * reentrega, e sem esta varredura o evento ficaria perdido.
 *
 * A varredura é UMA só, parametrizada pela tabela de entregas do provedor
 * ATIVO (#36): cada gateway tem a sua (`mercadopago_webhook_event`,
 * `asaas_webhook_event`) porque a chave de dedup é do dialeto dele, mas o
 * tratamento — normalizar, consultar o gateway, aplicar, carimbar — é idêntico.
 * Varrer a tabela do provedor inativo seria pior que inútil: o adapter ativo
 * normalizaria payload de outro dialeto e consultaria ids que não existem na
 * API dele, carimbando eventos legítimos como falha definitiva (4xx).
 */
export async function reprocessarEventosPendentes(
  limite = 50,
): Promise<{ aplicados: number; falhas: number }> {
  const { asaasWebhookEvent, mercadopagoWebhookEvent } =
    await import("@/db/schema");
  const provider = getBillingProvider();

  /**
   * Duas ramificações explícitas em vez de uma tabela em variável: as duas
   * tabelas do Drizzle são tipos distintos, e uni-las num `const` faria o
   * `.set()` perder a checagem de campo — exatamente a garantia que impede
   * carimbar a coluna errada. A projeção explícita (`id`, `payload`) deixa os
   * dois ramos com o MESMO tipo de linha daqui para baixo.
   */
  const ehAsaas = provider.id === "asaas";

  const pendentes = ehAsaas
    ? await authDb
        .select({
          id: asaasWebhookEvent.id,
          payload: asaasWebhookEvent.payload,
        })
        .from(asaasWebhookEvent)
        .where(isNull(asaasWebhookEvent.aplicadoEm))
        .limit(limite)
    : await authDb
        .select({
          id: mercadopagoWebhookEvent.id,
          payload: mercadopagoWebhookEvent.payload,
        })
        .from(mercadopagoWebhookEvent)
        .where(isNull(mercadopagoWebhookEvent.aplicadoEm))
        .limit(limite);

  const marcar = async (
    id: string,
    campos: { aplicadoEm?: Date; erroAplicacao?: string | null },
  ): Promise<void> => {
    if (ehAsaas) {
      await authDb
        .update(asaasWebhookEvent)
        .set(campos)
        .where(eq(asaasWebhookEvent.id, id));
      return;
    }
    await authDb
      .update(mercadopagoWebhookEvent)
      .set(campos)
      .where(eq(mercadopagoWebhookEvent.id, id));
  };

  let aplicados = 0;
  let falhas = 0;

  for (const evento of pendentes) {
    try {
      const normalizado = provider.normalizarEvento(evento.payload);

      if (normalizado.providerChargeId) {
        // Evento de COBRANÇA de ciclo. Consulta o gateway em vez de confiar no
        // tipo do evento, pela mesma razão de `aplicarStatusProvider`: a
        // notificação costuma vir sem estado nenhum.
        const atual = await provider.consultarCobranca(
          normalizado.providerChargeId,
        );
        await conciliarPagamentoDeCiclo(
          normalizado.providerChargeId,
          atual.status,
        );
      } else if (normalizado.providerSubscriptionId) {
        const atual = await provider.consultarVinculo(
          normalizado.providerSubscriptionId,
        );
        await aplicarStatusProvider(
          normalizado.providerSubscriptionId,
          atual.status,
        );
      } else {
        // Sem id nenhum não há o que aplicar. Marca como aplicado para não
        // reprocessar eternamente um evento que nunca terá efeito.
        await marcar(evento.id, {
          aplicadoEm: new Date(),
          erroAplicacao: "sem id utilizável",
        });
        continue;
      }

      await marcar(evento.id, { aplicadoEm: new Date(), erroAplicacao: null });
      aplicados++;
    } catch (e) {
      falhas++;
      // Distinção que decide se a linha volta na próxima varredura: recusa
      // definitiva do gateway (4xx — recurso inexistente, id que não é de
      // assinatura) NUNCA vai melhorar com retry, então é carimbada como
      // aplicada. Sem isso o evento é reselecionado para sempre, queimando uma
      // chamada ao MP por varredura e ocupando o `limit` que deveria servir a
      // eventos novos. Falha transitória (rede, timeout, 5xx) fica pendente de
      // propósito — é exatamente o caso que a varredura existe para recuperar.
      //
      // Nem todo 4xx é definitivo. 401 (token rotacionado/expirado), 408 e 429
      // (rate limit) são transitórios na prática: um pico de 429 carimbaria um
      // LOTE de eventos legítimos como aplicados e eles nunca mais entrariam na
      // fila — perda de faturamento silenciosa, o pior modo de falha possível
      // aqui. Estes três voltam para a fila junto com rede e 5xx.
      const TRANSITORIOS_APESAR_DE_4XX = new Set([401, 408, 429]);
      const definitiva =
        e instanceof BillingProviderError &&
        typeof e.status === "number" &&
        e.status >= 400 &&
        e.status < 500 &&
        !TRANSITORIOS_APESAR_DE_4XX.has(e.status);
      await marcar(evento.id, {
        erroAplicacao: e instanceof Error ? e.message : String(e),
        ...(definitiva ? { aplicadoEm: new Date() } : {}),
      });
    }
  }

  return { aplicados, falhas };
}
