import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { billingCycle, subscription } from "@/db/schema";
import { calcularMensalidadeCentavos } from "./calculator";
import {
  AsaasProvider,
  BillingProviderError,
  getBillingProvider,
  getProviderPorId,
  type AutorizacaoPendente,
  type BillingProvider,
  type MetodoPagamento,
  type StatusAssinaturaProvider,
  type StatusCobranca,
  type TipoEventoNormalizado,
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
const DIAS_ANTECEDENCIA_APURACAO = 0;

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

/**
 * Traduz a forma de autorização para as colunas — sempre escrevendo as duas,
 * uma com valor e a outra `null`.
 *
 * Escrever `null` na que não vale é o ponto: no `onConflictDoUpdate`, deixar a
 * coluna de fora manteria o valor da tentativa anterior, e uma clínica que
 * refizesse a ativação com o trilho trocado ficaria com URL velha e BR Code
 * novo convivendo na mesma linha — sem erro, e com a UI ramificando pela
 * errada.
 */
export function colunasDaAutorizacao(autorizacao: AutorizacaoPendente): {
  checkoutUrl: string | null;
  pixCopiaECola: string | null;
  valorAtivacaoCentavos: number | null;
} {
  return autorizacao.forma === "redirect"
    ? {
        checkoutUrl: autorizacao.url,
        pixCopiaECola: null,
        // `null`, não 0: o redirect não cobra para autorizar, e zero afirmaria
        // "cobrou nada" onde a verdade é "não houve cobrança".
        valorAtivacaoCentavos: null,
      }
    : {
        checkoutUrl: null,
        pixCopiaECola: autorizacao.brCode,
        valorAtivacaoCentavos: autorizacao.valorAtivacaoCentavos,
      };
}

/** Reconstrói a forma de autorização a partir da linha persistida. */
export function autorizacaoPersistida(linha: {
  checkoutUrl: string | null;
  pixCopiaECola: string | null;
  valorAtivacaoCentavos: number | null;
}): AutorizacaoPendente | null {
  if (linha.pixCopiaECola) {
    // Fail-closed (D22): sem o valor não dá para reconstruir a forma Pix, e
    // inventar um número seria pior que qualquer alternativa — o BR Code já tem
    // o preço real gravado no payload EMV, então uma tela que exiba o QR
    // dizendo outro valor mente com aparência de precisão. Devolver `null` cai
    // no caminho "pendente sem saída", que a UI já trata: a clínica reativa e
    // recebe um QR novo cujo preço nós sabemos.
    if (linha.valorAtivacaoCentavos === null) return null;
    return {
      forma: "pix_copia_e_cola",
      brCode: linha.pixCopiaECola,
      valorAtivacaoCentavos: linha.valorAtivacaoCentavos,
    };
  }
  if (linha.checkoutUrl) {
    return { forma: "redirect", url: linha.checkoutUrl };
  }
  return null;
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
  /**
   * Como a clínica termina de autorizar — URL de checkout ou BR Code do Pix,
   * conforme o trilho. `null` só acontece reaproveitando um vínculo pendente
   * antigo cuja forma não ficou guardada; a UI trata isso como "pendente sem
   * caminho de saída" em vez de renderizar um link vazio (era o `?? ""`).
   */
  autorizacao: AutorizacaoPendente | null;
  providerSubscriptionId: string;
}

/**
 * Registra o meio de pagamento da clínica. **Não cobra a mensalidade** — mas
 * "não cobra nada", que era o que estava escrito aqui, é falso no trilho de Pix
 * Automático (débito D22). A Jornada 3 do Bacen só ativa a autorização depois
 * que o QR imediato é liquidado, então o adapter do Asaas cobra um valor
 * simbólico para que ela exista. Quanto foi cobrado volta em
 * `ResultadoAtivacao.autorizacao.valorAtivacaoCentavos` e fica gravado em
 * `subscription.valor_ativacao_centavos`, para que a tela consiga dizer isso à
 * clínica antes de ela ler o QR.
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

  // `existente.provider === provider.id` NÃO é redundante com o status: quando
  // o trilho ativo muda (`BILLING_PROVIDER`), a linha antiga continua
  // `setup_pending` com um id que só existe no gateway ANTERIOR. Sem esta
  // comparação, o id de preapproval do Mercado Pago era consultado no Asaas,
  // que responde 400 — e o erro sobe antes de qualquer criação, travando a
  // ativação da clínica para sempre. Vínculo de outro gateway simplesmente não
  // é reaproveitável: cai no caminho de criação e o `onConflictDoUpdate`
  // abaixo reescreve `provider` + `providerSubscriptionId` juntos.
  if (
    existente?.providerSubscriptionId &&
    existente.status === "setup_pending" &&
    existente.provider === provider.id
  ) {
    const atual = await provider.consultarVinculo(
      existente.providerSubscriptionId,
    );
    // Só reaproveita enquanto continua pendente no gateway. Se já autorizou,
    // cair aqui significa que o webhook atrasou; aplicar o efeito agora é
    // melhor que devolver um checkout de algo já resolvido.
    if (atual.status === "pendente") {
      return {
        autorizacao: autorizacaoPersistida(existente),
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
      // Sempre escrito, junto com `provider` — mesma disciplina do D21/D24: o id
      // de cliente só vale dentro do gateway que o emitiu, então par misto
      // (provedor novo, cliente velho) é o estado a evitar. `?? null` porque
      // trilho sem cliente separado não tem o que gravar, e omitir a coluna
      // deixaria o resíduo da tentativa anterior.
      providerCustomerId: criado.providerCustomerId ?? null,
      // Colunas próprias (0075 e 0088). Cada forma de autorização na sua: o
      // BR Code do Pix não é URL, e gravá-lo em `checkout_url` era o D21.
      ...colunasDaAutorizacao(criado.autorizacao),
      metodoPagamento: pedido.metodo,
      cicloDias: CICLO_DIAS_PADRAO,
    })
    .onConflictDoUpdate({
      target: subscription.clinicId,
      set: {
        status: "setup_pending",
        provider: provider.id,
        providerSubscriptionId: criado.providerVinculoId,
        providerCustomerId: criado.providerCustomerId ?? null,
        ...colunasDaAutorizacao(criado.autorizacao),
        metodoPagamento: pedido.metodo,
        atualizadoEm: new Date(),
      },
    });

  return {
    autorizacao: criado.autorizacao,
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
 *
 * ## O adapter sai da LINHA, não da env (D26)
 *
 * Cada assinatura é cobrada no gateway em que ela nasceu — `subscription.provider`
 * — e não no que `BILLING_PROVIDER` aponta hoje. Resolver pela env aqui era o
 * gêmeo do D25 dentro do job noturno: depois da virada para o Asaas, uma
 * assinatura ativa do Mercado Pago teria o `preapproval_id` dela mandado para
 * `emitirCobrancaDeCiclo` do Asaas, que consulta
 * `GET /pix/automatic/authorizations/{id}` e responde 400.
 *
 * O modo de falha é o pior desta base: o D25 quebra na cara da clínica, na tela;
 * este quebra no job, o ciclo fica com `erro` preenchido, e **ninguém é
 * cobrado**. É a mesma razão pela qual `reprocessarEventosPendentes` casa cada
 * tabela de webhook com o adapter dela em vez de olhar a env.
 */
export async function fecharCiclosVencendo(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoFechamento[]> {
  const agora = opcoes?.agora ?? new Date();
  const dryRun = opcoes?.dryRun ?? false;

  const vencendo = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      provider: subscription.provider,
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
          // `provider` é nullable desde a 0090 (representa "sem vínculo de
          // cobrança"). Aqui a linha TEM vínculo, então nulo é estado
          // impossível — o CHECK do banco o proíbe. Falhar alto em vez de
          // cair num default: emitir cobrança pelo gateway errado é dinheiro.
          if (!assinatura.provider) {
            throw new Error(
              `Assinatura ${assinatura.subscriptionId} tem vínculo de cobrança (${assinatura.providerSubscriptionId}) mas nenhum provedor gravado — não dá para saber qual gateway cobrar.`,
            );
          }
          // Resolvido AQUI, por linha, e não uma vez no topo da função: a
          // varredura cobre assinaturas de gateways diferentes na mesma passada.
          const provider = getProviderPorId(assinatura.provider);
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
/**
 * #286 — guarda da suposição NÃO MEDIDA: o evento disse "recusa", a reconsulta
 * discordou.
 *
 * `conciliarPagamentoDeCiclo` só nomeia o teto do Pix Automático como causa
 * provável no ramo `recusada`, e esse ramo depende inteiramente de a reconsulta
 * a `GET /payments/{id}` devolver `OVERDUE` — o único status que
 * `mapearStatusCobranca` mapeia para `recusada`. Que uma
 * `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED` real deixe o `payment`
 * associado em `OVERDUE` é SUPOSIÇÃO: o sandbox medido em 13/08/2026 só tinha
 * cobranças em `PENDING` e nenhuma recusa de fato chegou a acontecer.
 *
 * O problema não é a suposição — é que, se ela estiver errada, o caminho é MUDO
 * nas quatro camadas ao mesmo tempo:
 *
 * - o ciclo continua `aguardando_pagamento`, e não existe varredura nenhuma que
 *   olhe para ciclos parados nesse estado;
 * - a assinatura continua `active`, então nem a tarja de cobrança acusa;
 * - `conciliarPagamentoDeCiclo` cai no `return true` final (`pendente` não move
 *   nada), então a rota carimba `aplicado_em = now()` com
 *   `erro_aplicacao = NULL` — indistinguível de uma aplicação limpa;
 * - e o `console.warn` do ramo `recusada` fica justamente onde o estado JÁ é
 *   visível no banco, não onde ele some.
 *
 * Resultado: o runbook do `infra/README.md` manda medir "quando a primeira
 * recusa real chegar", mas sem esta linha não há absolutamente nada que avise
 * que ela chegou. A suposição só seria descoberta por conferência manual.
 *
 * Mesma tag `[billing-recusa]` do outro aviso de propósito: um grep só tem que
 * trazer as duas metades da hipótese — a que conciliou e a que não conciliou.
 *
 * Não altera estado, de propósito: transformar em `falhou` um `payment` que o
 * gateway afirma estar `PENDING` poria a clínica em `past_due` por suposição, e
 * o que falta aqui é sinal, não decisão.
 */
export function avisarRecusaQueNaoConciliou(
  tipoEvento: TipoEventoNormalizado,
  providerChargeId: string,
  statusReconsultado: StatusCobranca,
): void {
  // Só os `cobranca.*`: são os que trazem `externalReference = cycle:<id>`, ou
  // seja, cobrança NOSSA. `pagamento.recusado` é cobrança de outra origem
  // apontada para o mesmo endpoint — avisar sobre ela seria ruído que treina
  // quem lê o log a ignorar a tag.
  const eventoDizRecusa =
    tipoEvento === "cobranca.recusada" || tipoEvento === "cobranca.vencida";
  if (!eventoDizRecusa || statusReconsultado === "recusada") return;

  console.warn(
    "[billing-recusa] evento de recusa NÃO virou recusa na reconsulta (#286)",
    { providerChargeId, tipoEvento, statusReconsultado },
  );
}

export async function conciliarPagamentoDeCiclo(
  providerChargeId: string,
  status: StatusCobranca,
  motivoRecusa: string | null = null,
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
    /**
     * #286 — "recusada" sozinho manda quem diagnostica para o lugar errado.
     * O teto de valor do Pix Automático é OBRIGATÓRIO por diretriz do BACEN:
     * todo app de banco pergunta, em toda ativação, sugerindo o valor da
     * cobrança em tela (a ativação, não a mensalidade). Um teto aceito com
     * essa sugestão recusa toda fatura real — e é o modo de falha mais
     * provável da cobrança recorrente, não uma hipótese remota.
     *
     * Quando o gateway informa a causa, ela MANDA: "avise o cliente para
     * ajustar o limite no banco" e "avise o cliente para pôr dinheiro na
     * conta" são orientações opostas, e sobrepor a nossa hipótese a um motivo
     * explícito do gateway trocaria uma por outra. Medido em 13/08/2026: o
     * Asaas não informou motivo em nenhuma recusa observável, então o ramo
     * `null` é o esperado — e ele diz que a causa é HIPÓTESE, não fato.
     *
     * Suposição aberta, NÃO medida: este ramo só é alcançado se a reconsulta
     * a `GET /payments/{id}` (feita em `route.ts`) devolver
     * `status: "OVERDUE"` — `mapearStatusCobranca` (`asaas.ts`) só mapeia
     * `OVERDUE` para `"recusada"`. A recusa de instrução do Pix Automático
     * (`INSTRUCTION_REFUSED`) chega ao webhook SEM `payment.status`, só com
     * `paymentInstruction.status` (ver `normalizarEventoAsaas`), e o que a
     * reconsulta devolve para o `payment` associado a uma recusa de
     * instrução real não foi observado — o sandbox medido em 13/08/2026 só
     * tinha cobranças em `PENDING`. Se a primeira recusa real chegar com o
     * `payment` ainda em `PENDING`, este ramo NÃO dispara e nada é gravado.
     * Verificação pendente quando a primeira recusa real chegar: runbook em
     * `infra/README.md` (seção #286).
     */
    const erro = motivoRecusa
      ? `cobrança recusada pelo gateway: ${motivoRecusa}`
      : "cobrança recusada pelo gateway, sem motivo informado — causa mais provável: teto de valor do Pix Automático definido no app do banco abaixo do valor da fatura (#286); segunda hipótese: saldo insuficiente";

    // Log com tag fixa e greppável: é por ele que a primeira recusa real de
    // produção vira sinal em vez de linha morta na tabela.
    console.warn("[billing-recusa] cobrança de ciclo recusada", {
      providerChargeId,
      motivoRecusa,
    });

    await authDb
      .update(billingCycle)
      .set({ status: "falhou", erro })
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
 * Varredura periódica de eventos de webhook que ficaram pendentes de aplicação
 * (status `aplicado_em IS NULL`).
 *
 * Executada por job cron/worker de background para tratar entregas que falharam
 * por erro transitório (ex.: instabilidade de banco durante a chamada do webhook)
 * ou webhook recebido fora de ordem. O provedor do webhook garante retentativa
 * com backoff, mas o job garante cura eventual mesmo se o gateway desistir da
 * reentrega, e sem esta varredura o evento ficaria perdido.
 *
 * A varredura passa pelos eventos pendentes do Asaas (único provedor ativo, #36).
 *
 * O `limite` restringe a cota de processamento por passada.
 */
export async function reprocessarEventosPendentes(
  limite = 50,
): Promise<{ aplicados: number; falhas: number }> {
  const { asaasWebhookEvent } = await import("@/db/schema");

  let aplicados = 0;
  let falhas = 0;

  const provider: BillingProvider = new AsaasProvider();

  const pendentes = await authDb
    .select({
      id: asaasWebhookEvent.id,
      payload: asaasWebhookEvent.payload,
    })
    .from(asaasWebhookEvent)
    .where(isNull(asaasWebhookEvent.aplicadoEm))
    .limit(limite);

  const marcar = async (
    id: string,
    campos: { aplicadoEm?: Date; erroAplicacao?: string | null },
  ): Promise<void> => {
    await authDb
      .update(asaasWebhookEvent)
      .set(campos)
      .where(eq(asaasWebhookEvent.id, id));
  };

  for (const evento of pendentes) {
    try {
      const normalizado = provider.normalizarEvento(evento.payload);

      if (normalizado.providerChargeId) {
        // Evento de COBRANÇA de ciclo. Consulta o gateway em vez de confiar
        // no tipo do evento, pela mesma razão de `aplicarStatusProvider`: a
        // notificação costuma vir sem estado nenhum.
        const atual = await provider.consultarCobranca(
          normalizado.providerChargeId,
        );
        // Gêmeo do guard da rota (#286): a varredura aplica o evento quando a
        // entrega ao vivo falhou, e um guard que existe só num dos dois some
        // exatamente no cenário em que o webhook não chegou.
        avisarRecusaQueNaoConciliou(
          normalizado.tipo,
          normalizado.providerChargeId,
          atual.status,
        );
        await conciliarPagamentoDeCiclo(
          normalizado.providerChargeId,
          atual.status,
          atual.motivoRecusa,
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

      await marcar(evento.id, {
        aplicadoEm: new Date(),
        erroAplicacao: null,
      });
      aplicados++;
    } catch (e) {
      falhas++;
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
