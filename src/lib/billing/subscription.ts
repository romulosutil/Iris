import "server-only";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { authDb } from "@/db/client";
import { auditLog, billingCycle, subscription } from "@/db/schema";

export const ACAO_ASSINATURA_CANCELADA_POR_INADIMPLENCIA =
  "assinatura_cancelada_por_inadimplencia";
import { apurarDebitoProRata, calcularMensalidadeCentavos } from "./calculator";
import {
  classificarRecusa,
  CODIGOS_RETENTAVEIS_AUTOMATICAMENTE,
  type GrupoRecusa,
} from "./classificacao-recusa";
import {
  classificarFalhaDeConciliacao,
  MOTIVO_ASSINATURA_DESCONHECIDA,
  MOTIVO_EVENTO_SEM_ID,
  PREFIXO_REFERENCIA_CICLO,
} from "./erro-aplicacao";
import { notificarCancelamentoAssinatura } from "./notificacao-cancelamento";
import {
  calcularDueDateDeRetentativa,
  JANELA_RETENTATIVA_DIAS_CORRIDOS,
} from "./retentativa-data";
import {
  AsaasProvider,
  BillingProviderError,
  getBillingProvider,
  getProviderPorId,
  type AutorizacaoPendente,
  type BillingProvider,
  type EventoWebhookNormalizado,
  type MetodoPagamento,
  type MotivoRecusaDeRetentativa,
  type StatusAssinaturaProvider,
  type StatusCobranca,
  type TipoEventoNormalizado,
} from "./provider";
import { vencimentoCobrancaDeCiclo } from "./vencimento";

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

/*
 * O prazo de vencimento da cobrança do ciclo NÃO mora mais aqui. Era
 * `DIAS_VENCIMENTO_COBRANCA = 5`, somado em dias corridos; agora vem de
 * `vencimentoCobrancaDeCiclo` (#317): 5 dias corridos continuam sendo o alvo,
 * mas a data é empurrada até satisfazer a janela do Pix Automático em dias
 * úteis bancários — a constante ficaria sem referência e um "5" solto no
 * arquivo convidaria a religar a conta antiga. Esgotado o prazo sem pagamento,
 * o ciclo vai a `falhou` e a assinatura a `past_due`, onde a carência
 * (`subscription.carencia_dias`, por linha) começa a correr. Quem consome esse
 * prazo é `cancelarAssinaturasComCarenciaVencida` (#319) — antes dela nada
 * consumia, e `past_due` era terminal na prática.
 */

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
  const virandoCancelada = novo === "canceled" && linha.status !== "canceled";

  await authDb
    .update(subscription)
    .set({
      status: novo,
      atualizadoEm: agora,
      ativadaEm: virandoAtiva ? (linha.ativadaEm ?? agora) : linha.ativadaEm,
      // `?? agora` na ENTRADA em canceled, pela mesma razão de `past_due_desde`:
      // a reentrega do webhook não pode mover o instante de corte, senão o
      // débito pro-rata muda a cada tentativa.
      //
      // E **zerado na reativação** (#290). Sem isto, a clínica que cancela,
      // volta e cancela de novo tem o SEGUNDO débito apurado contra o corte do
      // PRIMEIRO: `congelarCiclosComoDebito` lê `cancelada_em`, e um valor
      // antigo faz `encerradoEm` cair antes do início do ciclo novo, onde
      // `apurarDebitoProRata` satura no piso de 1 dia. Ciclo de 10 dias usados
      // sairia por R$ 1,30 em vez de R$ 13,00 — exatamente o dia grátis que a
      // #290 existe para fechar, reaberto pelo caminho de volta.
      canceladaEm:
        novo === "canceled"
          ? (linha.canceladaEm ?? agora)
          : virandoAtiva
            ? null
            : linha.canceladaEm,
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

  if (novo === "canceled") {
    // Depois do UPDATE, e lendo `cancelada_em` do valor já persistido: se esta
    // chamada falhar aqui, o webhook é reentregue e a reexecução precisa apurar
    // contra o MESMO instante de corte, senão o débito muda a cada tentativa.
    //
    // A transação é de UM passo aqui — `congelarCiclosComoDebito` exige um
    // executor transacional porque no corte por carência (#319) ela é atômica
    // com o UPDATE de status. Neste caminho a ordem já é segura: o webhook é
    // reentregue e a reexecução se cura.
    await authDb.transaction((tx) =>
      congelarCiclosComoDebito(tx, linha.id, linha.canceladaEm ?? agora),
    );
  }

  if (virandoCancelada) {
    // Notifica o responsável da clínica por e-mail sobre o cancelamento, corte
    // imediato de escrita e valor em aberto do ciclo interrompido (#312).
    // Disparado APÓS a transação de congelamento commitada e protegido por
    // try/catch para que falhas de rede/e-mail nunca afetem o faturamento.
    try {
      await notificarCancelamentoAssinatura(linha.clinicId, linha.id);
    } catch (err) {
      console.error(
        "[billing-cancelamento] falha ao despachar aviso por e-mail:",
        err,
      );
    }
  }

  return true;
}

/**
 * Fecha os ciclos vivos de uma assinatura cancelada como DÉBITO pro-rata
 * (#287 Problema 1, desenho na #290).
 *
 * O bug que isto conserta: `fecharCiclosVencendo` varre
 * `subscription.status = 'active'`. Assinatura cancelada sai da varredura para
 * sempre, e o `billing_cycle` em `aberto` do ciclo interrompido nunca mais era
 * olhado — pacientes apurados, nenhuma fatura, nada vermelho em lugar nenhum.
 * É o caminho normal de todo cancelamento: ninguém revoga a autorização no app
 * do banco exatamente na virada do ciclo.
 *
 * ## Não emite cobrança, de propósito
 *
 * A autorização do Pix Automático acabou de ser revogada — é justamente o ato
 * que produziu este cancelamento. Não existe trilho para cobrar neste instante.
 * O ciclo fica congelado em `devido` e quem cobra é o gate de reativação
 * (#290): pagar o que deve é a porta de entrada de volta.
 *
 * ## A idempotência é por STATUS DO CICLO, não pela transição da assinatura
 *
 * Guardar por "estava active e virou canceled" seria uma armadilha: o UPDATE da
 * assinatura já commitou quando esta função roda, então uma falha aqui (rede,
 * `billing_apurar_ciclo` indisponível) deixaria a linha `canceled` e a
 * reentrega do webhook — que é como o Asaas se recupera — encontraria
 * `status === 'canceled'` e pularia o congelamento para sempre. Filtrando por
 * `status IN ('aberto','apurado')` a reexecução se auto-limita: ciclo já
 * congelado está em `devido` e não é encontrado de novo.
 *
 * `apurado` entra junto com `aberto` porque é o resíduo de um fechamento que
 * morreu no meio (apurou, falhou ao emitir); ele também nunca mais seria
 * varrido. `aguardando_pagamento`/`pago` ficam de fora: ali já existe cobrança
 * emitida no gateway e viva, e reescrever o valor descolaria o memorial da
 * fatura que a clínica recebeu.
 *
 * ## `falhou` entra só no corte por carência (#319)
 *
 * `incluirFalhou` existe porque os dois chamadores querem coisas diferentes do
 * MESMO ciclo. Na revogação da autorização (`aplicarStatusProvider`) o ciclo
 * `falhou` é uma cobrança que ainda pode ser paga e não deve ser mexida. No
 * corte por carência ele é exatamente a dívida: foi a recusa DELE que produziu
 * o `past_due` que venceu, e deixá-lo fora tornaria o gate de reativação da
 * #290 inalcançável por inadimplência — a clínica cortada não deveria nada e
 * voltaria de graça.
 *
 * Efeito colateral assumido (decisão do Rômulo, 15/08/2026): a cobrança antiga
 * do ciclo `falhou` continua `OVERDUE` e PAGÁVEL no Asaas enquanto o ciclo
 * vira `devido` aqui. Existe portanto uma janela de cobrança dupla — a clínica
 * pode pagar o boleto/Pix velho E o débito agrupado do gate — até a **#310**
 * (cancelamento da cobrança pendente no gateway) entrar. Aceito porque o
 * inverso (não congelar) é perda de receita silenciosa e permanente.
 */
/**
 * Executor de `authDb` dentro de uma transação.
 *
 * Derivado do próprio tipo de `authDb.transaction` em vez de importado do
 * Drizzle: o parâmetro genérico do `PgTransaction` muda com a versão do ORM, e
 * escrevê-lo à mão aqui viraria um segundo tipo para manter sincronizado.
 */
type TxAuth = Parameters<Parameters<typeof authDb.transaction>[0]>[0];

async function congelarCiclosComoDebito(
  tx: TxAuth,
  subscriptionId: string,
  encerradoEm: Date,
  opcoes?: { incluirFalhou?: boolean },
): Promise<void> {
  const congelaveis: ("aberto" | "apurado" | "falhou")[] = opcoes?.incluirFalhou
    ? ["aberto", "apurado", "falhou"]
    : ["aberto", "apurado"];

  const vivos = await tx
    .select({
      id: billingCycle.id,
      inicio: billingCycle.inicio,
      fim: billingCycle.fim,
      valorCentavos: billingCycle.valorCentavos,
      providerChargeId: billingCycle.providerChargeId,
    })
    .from(billingCycle)
    .where(
      and(
        eq(billingCycle.subscriptionId, subscriptionId),
        inArray(billingCycle.status, congelaveis),
      ),
    );

  for (const ciclo of vivos) {
    // Mesma separação do fechamento normal: a CONTAGEM vem do banco (SECURITY
    // DEFINER, `iris_auth` não tem grant em `patient`), o PREÇO vem daqui.
    const apuracao = await tx.execute<{ total: number }>(
      sql`SELECT billing_apurar_ciclo(${ciclo.id}::uuid) AS total`,
    );
    const fichasContadas =
      (apuracao as unknown as { total: number }[])[0]?.total ?? 0;

    const debito = apurarDebitoProRata({
      fichasAtivas: fichasContadas,
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      encerradoEm,
    });

    // Piso: nunca abaixo do que já foi FATURADO à clínica.
    //
    // Para ciclo já encerrado (o caso do `falhou`) o pro-rata satura em 1 —
    // `diasUsados` é limitado a `diasDoCiclo` —, então o valor volta cheio e a
    // reapuração é inofensiva. O que NÃO é garantido é a contagem:
    // `billing_apurar_ciclo` recontará as fichas do intervalo AGORA, e paciente
    // arquivado/expurgado desde o fechamento derrubaria o total, gravando um
    // débito menor que a cobrança que a clínica já recebeu no gateway.
    //
    // Quem decide é a EXISTÊNCIA de `provider_charge_id`, e não o status do
    // ciclo: onde há cobrança emitida, o valor dela é o piso; onde não há, o
    // pro-rata manda — que é o caso legítimo de valor MENOR que o cheio na
    // interrupção no meio do ciclo. Ler a condição como "`aberto`/`apurado` é
    // sem cobrança emitida" seria falso: `fecharCiclosVencendo` tem um ramo
    // (a guarda de idempotência da emissão) que deixa o ciclo em `apurado` COM
    // `provider_charge_id`, e esse ciclo entra aqui pelo lado do piso — que é o
    // tratamento correto para ele.
    const valorCentavos = ciclo.providerChargeId
      ? Math.max(ciclo.valorCentavos ?? 0, debito.valorCentavos)
      : debito.valorCentavos;

    await tx
      .update(billingCycle)
      .set({
        // `billing_apurar_ciclo` deixou o ciclo em `apurado`; `devido` é o
        // estado terminal, e é o que o tira da varredura de fechamento.
        status: "devido",
        valorCentavos,
        erro: null,
      })
      .where(eq(billingCycle.id, ciclo.id));
  }
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
          // Calculado UMA vez e persistido logo abaixo, em vez de ficar inline
          // no argumento: o backstop de D+7 (#318) mede a partir do vencimento
          // que de fato saiu daqui, e recalculá-lo depois o faria depender do
          // calendário bancário vigente NAQUELE dia — ver o comentário da
          // coluna `vencimento_cobranca` em `schema.ts`.
          const vencimento = vencimentoCobrancaDeCiclo(agora);
          const cobranca = await provider.emitirCobrancaDeCiclo({
            vinculoId: assinatura.providerSubscriptionId,
            valorCentavos,
            // Prefixo vindo da constante, e não de um literal solto: é ele que
            // o webhook usa para decidir se a falta de ciclo é alarme ou
            // desfecho esperado (#289). Duas cópias do mesmo prefixo derivam.
            referenciaExterna: `${PREFIXO_REFERENCIA_CICLO}${ciclo.id}`,
            descricao: `Iris — ficha(s) ativa(s) no ciclo encerrado em ${assinatura.cicloFim.toISOString().slice(0, 10)}`,
            vencimento,
          });
          providerChargeId = cobranca.providerChargeId;
          cobrancaEmitida = true;
          await authDb
            .update(billingCycle)
            .set({
              providerChargeId: cobranca.providerChargeId,
              cobrancaEmitidaEm: new Date(),
              // O marco do backstop de D+7. Gravado JUNTO com o id da cobrança
              // e na mesma escrita: um ciclo com `provider_charge_id` e sem
              // vencimento seria uma cobrança viva que a varredura nunca
              // alcança — o buraco que o backstop existe para tapar.
              vencimentoCobranca: vencimento,
              // A URL da fatura como ela SAIU nesta emissão. `?? null` e nunca
              // um `throw`: `urlPagamento` é opcional na porta, e um link de
              // conveniência ausente não pode derrubar uma cobrança que o
              // gateway já aceitou.
              invoiceUrl: cobranca.urlPagamento ?? null,
              // A URL da fatura como ela SAIU nesta emissão. `?? null` e nunca
              // um `throw`: `urlPagamento` é opcional na porta, e um link de
              // conveniência ausente não pode derrubar uma cobrança que o
              // gateway já aceitou.
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
 * Onde a passada parou quando o corte de UMA assinatura falhou.
 *
 * As três consequências são diferentes e exigem ações diferentes de quem lê o
 * log: `gateway` significa que a autorização de Pix Automático continua VIVA e
 * nada foi escrito; `congelamento` e `escrita` significam que a autorização já
 * foi revogada — a assinatura fica em `past_due` e a próxima passada retoma.
 * Sem este eixo, os três caem no mesmo `cortada: false` e a rota reporta como
 * "não cortada" uma clínica cuja autorização já morreu.
 */
export type EtapaCorteCarencia = "gateway" | "congelamento" | "escrita";

export interface ResultadoCortePorCarencia {
  clinicId: string;
  subscriptionId: string;
  /** Instante em que a inadimplência começou (`past_due_desde`). */
  pastDueDesde: Date;
  /** Carência da PRÓPRIA linha, não uma constante deste arquivo. */
  carenciaDias: number;
  /** `true` quando a assinatura foi de fato cortada nesta passada. */
  cortada: boolean;
  /** Preenchido só quando `cortada` é `false` por FALHA (nunca no dry-run). */
  etapaFalha?: EtapaCorteCarencia;
  /** Mensagem prefixada com a etapa — é o que a rota publica no JSON. */
  erro?: string;
  /**
   * `true` em TODOS os itens quando a passada bateu `TETO_CORTES_POR_PASSADA` e
   * deixou elegíveis para trás.
   *
   * Fica repetido item a item porque o retorno é uma LISTA: não há onde
   * pendurar um campo de passada inteira sem quebrar quem consome o array. Sem
   * ele, uma passada truncada é indistinguível de uma que cobriu tudo — e
   * "cobri tudo" sem ter coberto é a leitura errada mais cara aqui.
   */
  truncado?: boolean;
}

/**
 * Teto de assinaturas cortadas por execução (#319).
 *
 * A varredura faz N round-trips SEQUENCIAIS ao gateway dentro de um único
 * request, e o cliente do job (`scripts/fechamento-ciclo-billing.mjs`) desiste
 * em 30s. Sem teto, uma passada com muita inadimplente estoura o cliente e ele
 * PERDE a lista de quem foi cortado — enquanto o servidor continua cortando,
 * revogando autorizações de Pix Automático que ninguém registrou. Perder o
 * registro de um ato irreversível é pior que cortar devagar.
 *
 * 20 é o que cabe com folga nos 30s DEPOIS de `fecharCiclosVencendo`, que roda
 * antes e consome parte do orçamento. O resto não se perde: a varredura roda
 * todo dia e a ordenação é determinística (`past_due_desde` crescente), então a
 * passada seguinte retoma exatamente de onde esta parou — e o excedente aparece
 * em `truncado`.
 */
export const TETO_CORTES_POR_PASSADA = 20;

/**
 * Corte por carência vencida: `past_due` finalmente tem saída (#319).
 *
 * Até aqui `past_due` era TERMINAL na prática — três comentários nesta base
 * afirmavam que "a carência leva a `canceled`" e nenhuma linha de código fazia
 * isso. Assinatura inadimplente continuava escrevendo (ver `estado-conta.ts`:
 * `past_due` pode escrever de propósito) para sempre, sem nunca ser cobrada de
 * novo e sem nunca ser cortada.
 *
 * ## O prazo sai da LINHA, sempre
 *
 * `past_due_desde + carencia_dias <= agora`, com `carencia_dias` lido da
 * própria assinatura dentro do SQL. Nada de constante local: a coluna tem
 * default no banco (subiu de 7 para 10) e é por clínica; chumbar o número aqui
 * criaria uma segunda fonte de verdade que só divergiria em produção. O filtro
 * é do banco também para não trazer toda a base inadimplente e peneirar em JS.
 *
 * ## Fail-closed no gateway (decisão do Rômulo, 15/08/2026)
 *
 * O vínculo é cancelado no gateway ANTES de qualquer escrita, e falha ali
 * ABORTA o corte daquela assinatura: ela fica em `past_due`, o erro entra em
 * `falhas` e a próxima passada tenta de novo. Transicionar mesmo assim
 * deixaria uma autorização de Pix Automático VIVA no Asaas com a assinatura
 * morta no Iris — o banco continuaria autorizado a debitar uma clínica que o
 * produto já cortou, e nada nos dois lados acusaria a divergência.
 *
 * Fail-closed **não** é o mesmo que "todo erro barra": "a autorização não
 * existe mais" é o objetivo já atingido, e tratá-lo como falha fazia toda
 * passada diária repetir o mesmo 404 e nunca cortar — com `past_due` liberando
 * escrita o tempo todo. Ver `revogarVinculoIdempotente` abaixo e o adapter.
 *
 * ## A ORDEM DA ESCRITA É O DESENHO
 *
 * `cancelarVinculo` → **congelar** → **UPDATE status**, com os dois últimos na
 * MESMA transação. Congelar por último era irrecuperável: se o congelamento
 * falhasse depois do UPDATE commitado, a linha já estaria `canceled`, a passada
 * seguinte não a selecionaria (o predicado é `status = 'past_due'`) e NADA mais
 * congelaria — `levantarDebito` ficaria 0, o gate da #290 abriria e a clínica
 * cortada reativaria de graça. Nesta ordem, qualquer falha depois da revogação
 * deixa a linha em `past_due` e a passada seguinte se cura sozinha: a revogação
 * repetida é absorvida (idempotência acima) e o congelamento é idempotente por
 * status do ciclo.
 *
 * Uma clínica que falha não derruba a varredura das outras: mesmo isolamento
 * por linha e mesmo adapter-por-linha (D26) de `fecharCiclosVencendo`.
 */
export async function cancelarAssinaturasComCarenciaVencida(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoCortePorCarencia[]> {
  const agora = opcoes?.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const dryRun = opcoes?.dryRun ?? false;

  const elegiveis = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      pastDueDesde: subscription.pastDueDesde,
      carenciaDias: subscription.carenciaDias,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.status, "past_due"),
        // Redundante com o `+ interval` (NULL nunca satisfaz a comparação), e
        // mantido: é o que deixa o índice `subscription_carencia_idx`
        // (status, past_due_desde) utilizável e o predicado legível.
        isNotNull(subscription.pastDueDesde),
        sql`${subscription.pastDueDesde} + make_interval(days => ${subscription.carenciaDias}) <= ${agoraIso}::timestamptz`,
      ),
    )
    // Mais antigo primeiro. Sem ORDER BY o Postgres devolve na ordem que quiser,
    // e com o teto abaixo isso deixaria de ser cosmético: cada passada cortaria
    // um subconjunto arbitrário e uma linha azarada poderia nunca sair. É também
    // a ordem que o índice `subscription_carencia_idx` já serve.
    .orderBy(asc(subscription.pastDueDesde))
    // +1 é sonda, não cota: se veio uma linha ALÉM do teto, houve truncamento.
    .limit(TETO_CORTES_POR_PASSADA + 1);

  const truncado = elegiveis.length > TETO_CORTES_POR_PASSADA;
  const vencidas = truncado
    ? elegiveis.slice(0, TETO_CORTES_POR_PASSADA)
    : elegiveis;

  if (truncado) {
    // Tag fixa e greppável. O campo `truncado` do resultado é a via
    // programática; este log é o que sobrevive se o cliente do job desistir
    // antes da resposta — que é justamente o cenário que o teto existe para
    // evitar.
    console.warn("[billing-corte-truncado] elegíveis além do teto da passada", {
      teto: TETO_CORTES_POR_PASSADA,
      agora: agora.toISOString(),
    });
  }

  const resultados: ResultadoCortePorCarencia[] = [];
  const marcaTruncado = truncado ? { truncado: true } : {};

  for (const assinatura of vencidas) {
    // Impossível pelo predicado; estreita o tipo sem um `!`.
    if (!assinatura.pastDueDesde) continue;

    const base = {
      ...marcaTruncado,
      clinicId: assinatura.clinicId,
      subscriptionId: assinatura.subscriptionId,
      pastDueDesde: assinatura.pastDueDesde,
      carenciaDias: assinatura.carenciaDias,
    };

    // Dry-run responde QUEM seria cortado e para por aqui: não chama o gateway
    // e não escreve nada. Cancelar vínculo é irreversível do lado do banco —
    // a clínica teria que autorizar Pix Automático de novo.
    if (dryRun) {
      resultados.push({ ...base, cortada: false });
      continue;
    }

    try {
      await revogarECortarAssinatura(assinatura, agora, {
        motivo: "past_due vencido",
        statusEsperado: "past_due",
      });
      resultados.push({ ...base, cortada: true });
    } catch (e) {
      const etapa = etapaDoErro(e);
      resultados.push({
        ...base,
        cortada: false,
        etapaFalha: etapa,
        // A etapa vai PARA DENTRO da mensagem, e não só no campo ao lado: a
        // rota (`/api/internal/billing/fechar-ciclos`) publica `erro` e mais
        // nada em `carenciaFalhas`, e é esse JSON que o job registra no log.
        erro: `[${etapa}] ${detalharErro(e)}`,
      });
    }
  }

  return resultados;
}

export type MotivoNaoCancelavel = "sem_assinatura" | "estado_nao_cancelavel";

export type ResultadoCancelamentoVoluntario =
  | { cancelada: true }
  | {
      cancelada: false;
      motivo: MotivoNaoCancelavel;
      /** O que a linha tinha quando recusamos. `null` quando não há linha. */
      statusAtual: string | null;
    };

/**
 * Cancelamento VOLUNTÁRIO, pedido pelo coordenador na tela (#36, bloco C1).
 *
 * ## Por que reusa `revogarECortarAssinatura`
 *
 * O corte é o mesmo ato do corte por carência: revogar no gateway, congelar o
 * ciclo aberto como débito e só então matar a linha — nessa ordem, que é o
 * desenho (ver o cabeçalho de `cancelarAssinaturasComCarenciaVencida`).
 * Reescrever as três escritas aqui divergiria exatamente onde a divergência é
 * irrecuperável: congelar depois do UPDATE deixaria a clínica cortada sem
 * débito, e o gate da #290 abriria a reativação de graça.
 *
 * ## Aceita `active` E `past_due`
 *
 * `past_due` é terminal por inadimplência (#319), mas a clínica inadimplente é
 * justamente quem mais quer sair. O `statusEsperado` do compare-and-set sai da
 * linha LIDA, e não de um literal: passar `'active'` para uma linha `past_due`
 * faria o UPDATE afetar 0 linhas em silêncio — depois de a autorização de Pix
 * Automático já ter sido revogada.
 *
 * ## Fail-closed, igual à varredura
 *
 * Falha no gateway ABORTA e propaga: nada é escrito e a assinatura continua
 * viva dos dois lados. Transicionar assim mesmo deixaria uma autorização de
 * débito automático viva no Asaas contra uma assinatura morta no Iris.
 *
 * O aviso por e-mail (#312) sai DEPOIS do corte confirmado e num `catch`
 * próprio: e-mail que não sai não pode desfazer um cancelamento que já
 * aconteceu no gateway.
 */
export async function cancelarAssinaturaDaClinica(
  clinicId: string,
  opcoes?: { agora?: Date },
): Promise<ResultadoCancelamentoVoluntario> {
  const agora = opcoes?.agora ?? new Date();

  const [linha] = await authDb
    .select({
      subscriptionId: subscription.id,
      clinicId: subscription.clinicId,
      status: subscription.status,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
    })
    .from(subscription)
    .where(eq(subscription.clinicId, clinicId))
    .limit(1);

  if (!linha) {
    return { cancelada: false, motivo: "sem_assinatura", statusAtual: null };
  }

  if (linha.status !== "active" && linha.status !== "past_due") {
    return {
      cancelada: false,
      motivo: "estado_nao_cancelavel",
      statusAtual: linha.status,
    };
  }

  await revogarECortarAssinatura(linha, agora, {
    motivo: "cancelamento pedido pela clínica",
    statusEsperado: linha.status,
  });

  try {
    await notificarCancelamentoAssinatura(linha.clinicId, linha.subscriptionId);
  } catch (e) {
    // Tag fixa e greppável. O cancelamento JÁ aconteceu no gateway e no banco;
    // relançar aqui faria a tela dizer "falhou" sobre um ato irreversível que
    // deu certo.
    console.warn("[billing-cancelamento-aviso] e-mail não enviado", {
      clinicId: linha.clinicId,
      erro: e instanceof Error ? e.message : String(e),
    });
  }

  return { cancelada: true };
}

/**
 * Falha de corte carimbada com a ETAPA em que a passada parou.
 *
 * Existe porque o corte passou a ter DOIS chamadores (a carência vencida da
 * #319 e o backstop de D+7 da #318) e a etapa é a informação que separa "nada
 * aconteceu" de "a autorização de Pix Automático JÁ foi revogada". Devolvê-la
 * por variável mutável funcionava enquanto o corte morava dentro de um único
 * laço; num helper compartilhado ela precisa viajar com o erro.
 *
 * `cause` preservada de propósito: `detalharErro` desce a cadeia até a raiz, e é
 * de lá que saem `code`/`detail`/`hint` do Postgres.
 */
class ErroDeCorte extends Error {
  constructor(
    readonly etapa: EtapaCorteCarencia,
    causa: unknown,
  ) {
    super(causa instanceof Error ? causa.message : String(causa), {
      cause: causa,
    });
    this.name = "ErroDeCorte";
  }
}

/**
 * Etapa de um erro de corte. `gateway` é o default porque é a etapa em que
 * NADA foi escrito — atribuir uma etapa mais avançada a um erro que não sabemos
 * classificar afirmaria que a autorização já foi revogada, que é a leitura cara.
 */
function etapaDoErro(e: unknown): EtapaCorteCarencia {
  return e instanceof ErroDeCorte ? e.etapa : "gateway";
}

/**
 * Revoga o vínculo no gateway e mata a assinatura — o corte, inteiro (#319).
 *
 * Extraído do laço de `cancelarAssinaturasComCarenciaVencida` quando o backstop
 * de D+7 (#318) passou a precisar do MESMO corte para o G3 (autorização morta
 * confirmada pelo gateway). Duplicar as três escritas seria reimplementar a
 * ordem que é o desenho — e a cópia divergiria justamente no lugar em que a
 * divergência é irrecuperável (ver "A ORDEM DA ESCRITA É O DESENHO" acima).
 *
 * Lança `ErroDeCorte` com a etapa; nunca devolve falha em silêncio.
 */
async function revogarECortarAssinatura(
  assinatura: {
    clinicId: string;
    subscriptionId: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    pastDueDesde?: Date | null;
    carenciaDias?: number | null;
  },
  agora: Date,
  contexto: {
    /** Vai para a mensagem de erro. É o que o log do job mostra ao operador. */
    motivo: string;
    /** Status que a linha tinha na SELEÇÃO. Vira o compare-and-set do UPDATE. */
    statusEsperado: "active" | "past_due";
  },
): Promise<void> {
  // Onde a passada estava quando falhou. Sem isto, falha do gateway (nada
  // aconteceu) e falha do congelamento/escrita (autorização JÁ revogada) caem
  // no mesmo `cortada: false` e ninguém sabe qual das duas leu.
  let etapa: EtapaCorteCarencia = "gateway";

  try {
    // Fail-closed: sem gateway identificável não há como revogar, então não
    // há corte. Vale para `provider` nulo (assinatura sem vínculo de
    // cobrança, permitido desde a 0090) e para o id ausente.
    if (!assinatura.provider || !assinatura.providerSubscriptionId) {
      throw new Error(
        `Assinatura ${assinatura.subscriptionId} seria cortada (${contexto.motivo}) mas não tem vínculo cancelável no gateway (provider=${assinatura.provider ?? "null"}, id=${assinatura.providerSubscriptionId ?? "null"}) — corte abortado para não deixar autorização viva.`,
      );
    }

    // Adapter da LINHA (D26): a varredura cobre assinaturas de gateways
    // diferentes na mesma passada, e revogar no gateway errado responde 400
    // — o que aqui significaria não revogar nada.
    const provider = getProviderPorId(assinatura.provider);
    await revogarVinculoIdempotente(
      provider,
      assinatura.providerSubscriptionId,
    );

    await authDb.transaction(async (tx) => {
      // Congelar ANTES do UPDATE, e na mesma transação: ver "A ORDEM DA
      // ESCRITA É O DESENHO" no cabeçalho. Com `incluirFalhou`, porque aqui o
      // ciclo que motivou o corte é justamente a dívida.
      etapa = "congelamento";
      await congelarCiclosComoDebito(tx, assinatura.subscriptionId, agora, {
        incluirFalhou: true,
      });

      etapa = "escrita";
      const [cortada] = await tx
        .update(subscription)
        .set({
          status: "canceled",
          // O MESMO `agora` que foi para `encerradoEm` do congelamento: dois
          // relógios aqui fariam o débito ser apurado contra um instante e o
          // carimbo do corte registrar outro.
          canceladaEm: agora,
          // Zerar `past_due_desde` NÃO é cosmético. Se o carimbo
          // sobrevivesse, a clínica que reativasse mais tarde e sofresse UMA
          // recusa voltaria a `past_due` — e o `?? agora` de
          // `conciliarPagamentoDeCiclo` preserva o carimbo EXISTENTE, ou
          // seja, o antigo. A carência já nasceria vencida e a próxima
          // passada desta varredura cortaria na primeira recusa, sem
          // carência nenhuma. É a mesma classe de defeito do `cancelada_em`
          // não limpo na reativação (#290).
          pastDueDesde: null,
          atualizadoEm: agora,
        })
        .where(
          and(
            eq(subscription.id, assinatura.subscriptionId),
            // Compare-and-set: entre a seleção e aqui cabe o webhook de
            // pagamento que tira a assinatura do estado selecionado. Sem esta
            // condição o corte atropelaria uma quitação já conciliada.
            //
            // O estado esperado vem do CHAMADOR e não é uma lista: a carência
            // vencida seleciona `past_due`, o backstop de D+7 seleciona
            // `active` (G3 não carimba). Aceitar os dois de uma vez faria a
            // carência cortar uma clínica que ACABOU de pagar — `liquidarCiclo`
            // devolve a assinatura para `active`, que é o outro item da lista.
            eq(subscription.status, contexto.statusEsperado),
          ),
        )
        .returning({ id: subscription.id });

      if (!cortada) {
        // Estado que precisa de olho humano: o vínculo JÁ foi revogado no
        // gateway e a assinatura saiu do estado elegível no meio do caminho. O
        // throw derruba a transação inteira, então o congelamento feito
        // acima volta atrás — quem acabou de PAGAR não fica com os ciclos
        // congelados como dívida.
        throw new Error(
          `Assinatura ${assinatura.subscriptionId} saiu do estado elegível entre a seleção e o corte (pagamento conciliado no mesmo tick?) — o vínculo no gateway JÁ foi cancelado e precisa de reativação manual.`,
        );
      }

      // D34: Trilha atômica em `audit_log` para o cancelamento por inadimplência/carência.
      // Ator é null (ação automática do sistema / job noturno).
      await tx.insert(auditLog).values({
        clinicId: assinatura.clinicId,
        atorId: null,
        acao: ACAO_ASSINATURA_CANCELADA_POR_INADIMPLENCIA,
        entidade: "subscription",
        entidadeId: assinatura.subscriptionId,
        patientId: null,
        detalhe: {
          motivo: contexto.motivo,
          provider: assinatura.provider,
          providerSubscriptionId: assinatura.providerSubscriptionId,
          ...(assinatura.pastDueDesde
            ? { pastDueDesde: assinatura.pastDueDesde.toISOString() }
            : {}),
          ...(assinatura.carenciaDias != null
            ? { carenciaDias: assinatura.carenciaDias }
            : {}),
        },
        criadoEm: agora,
      });
    });

    // Notifica o responsável da clínica por e-mail sobre o corte por carência/backstop (#312).
    // Disparado APÓS a transação de congelamento e corte commitada.
    try {
      await notificarCancelamentoAssinatura(
        assinatura.clinicId,
        assinatura.subscriptionId,
      );
    } catch (err) {
      console.error(
        "[billing-cancelamento] falha ao despachar aviso por e-mail no corte por carência/backstop:",
        err,
      );
    }
  } catch (e) {
    throw e instanceof ErroDeCorte ? e : new ErroDeCorte(etapa, e);
  }
}

/**
 * Mensagem diagnosticável de um erro que pode chegar EMBRULHADO (#319, D33).
 *
 * `e.message` cru não serve aqui. O Drizzle converte toda falha de query em
 * `DrizzleQueryError`, cuja `message` é `Failed query: <SQL>\nparams: <...>` —
 * o SQL que nós mesmos escrevemos, nunca o que o Postgres respondeu. O erro
 * real (violação de constraint, `RAISE EXCEPTION` de trigger, deadlock) fica em
 * `cause`, encadeado. Medido: no caso de congelamento que falha por trigger, a
 * `message` externa é o `UPDATE` inteiro e a palavra que identifica a causa só
 * existe na `cause`.
 *
 * Por que a causa RAIZ e não a externa: quem lê isto é o log do job
 * (`scripts/fechamento-ciclo-billing.mjs` publica `carenciaFalhas[].erro` e mais
 * nada), e a etapa já vai no prefixo `[gateway|congelamento|escrita]`. O SQL
 * emitido não acrescenta nada que a etapa não diga.
 *
 * Por que `detail`/`hint` ENTRAM DEPOIS da `message`, e não no lugar dela: são
 * campos do Postgres que COMPLEMENTAM. Numa violação de FK, `message` é
 * "insert or update on table X violates foreign key constraint Y" e `detail` é
 * "Key (a)=(b) is not present in table Z" — trocar um pelo outro perde metade
 * do diagnóstico, e num `RAISE EXCEPTION` sem `DETAIL`/`HINT` (o caso comum)
 * uma cadeia de `??` que os prefira cai direto na `message` do embrulho.
 */
function detalharErro(e: unknown): string {
  // Teto de profundidade: `cause` pode ser cíclica e não há contrato que o
  // impeça. Oito níveis cobrem com folga o encadeamento real (app → Drizzle →
  // driver).
  let raiz: unknown = e;
  for (let i = 0; i < 8; i++) {
    if (!(raiz instanceof Error) || raiz.cause == null) break;
    raiz = raiz.cause;
  }

  if (!(raiz instanceof Error)) return String(raiz);

  // Campos do protocolo do Postgres tal como o driver `postgres` os anexa.
  // Ausentes em erro nosso (`new Error(...)`) e em `BillingProviderError`.
  const pg = raiz as Error & {
    code?: unknown;
    detail?: unknown;
    hint?: unknown;
  };
  const extras = (
    [
      ["code", pg.code],
      ["detail", pg.detail],
      ["hint", pg.hint],
    ] as const
  )
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([nome, v]) => `${nome}=${v as string}`);

  return extras.length > 0
    ? `${raiz.message} (${extras.join("; ")})`
    : raiz.message;
}

/**
 * Revoga o vínculo no gateway tratando como SUCESSO o caso em que ele já não
 * existe mais (#319).
 *
 * A porta `BillingProvider.cancelarVinculo` devolve `void` e não tem como
 * declarar idempotência no tipo; o adapter do Asaas já absorve o caso (ver
 * `AsaasProvider.cancelarVinculo`), e este guard é o mesmo contrato aplicado no
 * ponto onde a decisão fail-closed de fato acontece — vale para qualquer
 * adapter que a linha aponte (D26).
 *
 * A classificação é a MESMA de `reprocessarEventosPendentes`: erro do gateway é
 * `BillingProviderError` com `status`, erro de rede/timeout sobe cru. A régua,
 * porém, é mais estreita de propósito — só **404** significa "não há o que
 * revogar". 4xx definitivo não basta: um 400 `invalid_environment` (chave do
 * ambiente errado) também é definitivo e ali a autorização está VIVA; aceitá-lo
 * cortaria a assinatura no Iris deixando o banco autorizado a debitar.
 *
 * ⚠️ NÃO MEDIDO contra o Asaas: qual status o `DELETE` de uma autorização já
 * cancelada devolve de fato. A tolerância é desenho defensivo, não observação.
 */
async function revogarVinculoIdempotente(
  provider: BillingProvider,
  providerVinculoId: string,
): Promise<void> {
  try {
    await provider.cancelarVinculo(providerVinculoId);
  } catch (e) {
    if (!(e instanceof BillingProviderError) || e.status !== 404) throw e;
    // Greppável: o corte prossegue, mas o operador precisa poder ver que a
    // autorização já não estava lá — é o rastro de "o cliente revogou pelo app
    // do banco" ou de uma resposta perdida no timeout.
    console.warn(
      "[billing-corte] vínculo já inexistente no gateway; corte prossegue",
      { providerVinculoId },
    );
  }
}

/**
 * Dias após o vencimento em que o backstop carimba (#318, Decisão 2).
 *
 * **Não é um número escolhido.** Em D+7 do vencimento o
 * `POST /pix/automatic/paymentInstructions/{id}/retries` passa a devolver 400
 * pelo limite `7D` da política `ALLOW_THREE_IN_SEVEN_DAYS` (#317): a partir
 * dali o trilho automático está PROVADAMENTE esgotado, qualquer que tenha sido
 * o motivo da recusa. Mexer aqui não é afinar um parâmetro — é descolar o
 * produto do limite do gateway.
 *
 * Não exportada de propósito: um teste que importasse a constante concordaria
 * com qualquer valor que ela tivesse, inclusive com um errado. Os casos de D+6
 * e D+7 usam datas escritas à mão.
 */
const DIAS_ATE_BACKSTOP = 7;

/**
 * Teto de ciclos avaliados pelo backstop por execução.
 *
 * Mesmo orçamento de 30s do cliente do job que motivou
 * `TETO_CORTES_POR_PASSADA`, e o mesmo número pela pior hipótese: um ciclo G3
 * faz de uma a duas chamadas SEQUENCIAIS ao gateway (a reconsulta da
 * autorização e a revogação), e uma passada inteira de G3 custa o mesmo que
 * uma passada de cortes por carência. O resto não se perde — a ordenação é
 * determinística (vencimento crescente) e a passada seguinte retoma de onde
 * esta parou, com o excedente sinalizado em `truncado`.
 */
export const TETO_BACKSTOP_POR_PASSADA = 20;

/** O que o backstop fez com um ciclo vencido há mais de 7 dias. */
export type AcaoBackstop =
  /** A assinatura entrou em `past_due` agora; a carência começa a correr. */
  | "carimbada"
  /** G3 com autorização morta CONFIRMADA pelo gateway: assinatura cortada. */
  | "cortada"
  /** G6 — defeito nosso. Custo nosso: o backstop não toca na clínica. */
  | "ignorada_g6"
  /** Nada mudou: dry-run, ciclo que saiu do conjunto elegível, ou falha. */
  | "nenhuma";

export interface ResultadoBackstopPrazo {
  clinicId: string;
  subscriptionId: string;
  cycleId: string;
  /** O vencimento que MANDAMOS ao gateway — a origem do D+7. */
  vencimento: Date;
  /** Código cru persistido na recusa, ou `null` (silêncio, ou G6/G7/G0). */
  recusaCodigo: string | null;
  /** Grupo derivado do código. `G0` também é o grupo do `null`. */
  grupo: GrupoRecusa;
  acao: AcaoBackstop;
  /**
   * Preenchido quando algo falhou — inclusive quando a ação REALIZADA foi a
   * degradada: um G3 cuja reconsulta ao gateway não respondeu é carimbado (ação
   * reversível) e traz aqui o motivo de o corte não ter acontecido.
   */
  erro?: string;
  /** `true` em todos os itens quando a passada bateu o teto. */
  truncado?: boolean;
}

/**
 * Texto de diagnóstico do backstop em `billing_cycle.erro`.
 *
 * Escrito com `coalesce` no UPDATE: só preenche quando o ciclo ainda não tem
 * diagnóstico. Um ciclo G3 já foi a `falhou` com o motivo REAL da recusa, e
 * sobrescrevê-lo trocaria a causa pela consequência.
 */
const ERRO_BACKSTOP =
  "não pago até 7 dias após o vencimento; a janela de retentativa automática do Pix Automático se esgotou";

/**
 * Backstop de prazo: **o que a recusa operacional compra é tempo, não
 * imunidade** (#318, Decisão 2).
 *
 * ## O buraco que isto fecha
 *
 * A #318 fez a classificação governar o desfecho, e três grupos deixaram de
 * carimbar `past_due` no ato: G7 (falha do banco), G0 (código desconhecido — e
 * `null`, que é o estado de PRODUÇÃO enquanto o D35 não for medido lá) e G3
 * (autorização morta, que precisa de confirmação antes de qualquer ato
 * irreversível). Sem esta varredura, uma recusa desses três grupos não produz
 * consequência nenhuma: a assinatura segue `active`, a clínica segue
 * escrevendo, e ninguém é cobrado nunca mais. Assinatura gratuita vitalícia,
 * sem erro em lugar nenhum.
 *
 * ## Por que PRAZO e não contador de tentativas
 *
 * O desenho original escalava em 3 recusas. Caiu por três defeitos medidos:
 * contar TENTATIVAS NOSSAS conta a coisa errada (a clínica não controla quantas
 * vezes tentamos); contar WEBHOOKS RECEBIDOS é uma régua que se move sozinha
 * (depende do que o gateway resolve mandar, fato não medido em #321); e as duas
 * exigiriam persistir um contador — mais schema para medir a coisa errada. O
 * prazo não tem nenhum dos três, e o número não é escolha: ver
 * `DIAS_ATE_BACKSTOP`.
 *
 * ## O relógio começa no CARIMBO, não na recusa
 *
 * `past_due_desde` recebe `agora` (o instante de D+7), e não a data da recusa:
 * a carência começa quando concluímos que a clínica deve. Ela fica com 7 + 10 =
 * 17 dias, e isso é intencional — quem foi recusado por falha do banco não
 * perde o prazo que a falha consumiu.
 *
 * ## O ciclo vai para `falhou`, e isso NÃO é cosmético
 *
 * `congelarCiclosComoDebito` congela `aberto`/`apurado`/`falhou` — e
 * **`aguardando_pagamento` não está na lista**. Um ciclo carimbado aqui e
 * deixado em `aguardando_pagamento` produziria `past_due`, corte por carência
 * 10 dias depois e `levantarDebito` = **0**: o gate de reativação da #290
 * abriria e a clínica cortada voltaria de graça. É exatamente o buraco que a
 * D-4 da #319 fechou para o outro ramo.
 *
 * ## G6 não tem backstop, deliberadamente
 *
 * Defeito nosso é custo nosso. Os códigos de G6 dizem que a INSTRUÇÃO estava
 * errada (`DUE_DATE_MISMATCH`, `RECEIVED_TOO_LATE`, `AMOUNT_MISMATCH`…), e o
 * vencimento a partir do qual este backstop conta é justamente o que NÓS
 * calculamos: cobrar D+7 de um `dueDate` que o gateway recusou por ser nosso
 * erro seria carimbar a clínica de inadimplente pelo nosso bug.
 *
 * **Fechado em 24/08/2026 (D39):** `conciliarPagamentoDeCiclo` volta a
 * persistir `recusa_codigo` para G6, mas só quando o ciclo ainda não tem um
 * (é a PRIMEIRA recusa dele) — retentativa nossa mal emitida que chega DEPOIS
 * de uma recusa de saldo legítima continua sem sobrescrever o diagnóstico
 * correto. Com o código gravado, o guard abaixo classifica G6 corretamente e
 * ignora — antes, um ciclo cuja PRIMEIRA recusa foi G6 chegava aqui com
 * `recusa_codigo = null`, indistinguível do silêncio total (G0), e era
 * carimbado por um bug nosso. `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` (a #322,
 * orquestração de retentativa, produz esse caso em rotina) é um G6.
 *
 * ## Fail-closed do G3
 *
 * G3 é o único grupo cujo desfecho é o CORTE, e o corte revoga a autorização de
 * Pix Automático — o ato mais irreversível deste repositório, que não volta sem
 * novo consentimento da clínica no app do banco. Por isso o corte só acontece
 * se o gateway DISSER que a autorização está morta
 * (`CANCELLED`/`EXPIRED`/`REFUSED`, que o adapter mapeia para `cancelada`). Se
 * responder `ACTIVE`, o código mentiu e o caso vira G7 — carimbo, não corte.
 * Rede, timeout e 5xx barram o CORTE (não se age sobre o que não se leu), e o
 * ciclo cai no carimbo, que é reversível por pagamento. Toda degradação leva ao
 * mesmo lugar seguro: cortar 10 dias depois, pela carência, em vez de cortar
 * agora sem prova.
 *
 * ## Ordem na rota: por ÚLTIMO
 *
 * Ver o comentário em `/api/internal/billing/fechar-ciclos/route.ts`.
 */
export async function aplicarBackstopDePrazo(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoBackstopPrazo[]> {
  const agora = opcoes?.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const dryRun = opcoes?.dryRun ?? false;

  const elegiveis = await authDb
    .select({
      cycleId: billingCycle.id,
      clinicId: billingCycle.clinicId,
      subscriptionId: billingCycle.subscriptionId,
      cicloStatus: billingCycle.status,
      vencimento: billingCycle.vencimentoCobranca,
      recusaCodigo: billingCycle.recusaCodigo,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
    })
    .from(billingCycle)
    .innerJoin(subscription, eq(subscription.id, billingCycle.subscriptionId))
    .where(
      and(
        // Os dois estados de "cobrança emitida e não liquidada". `pago` e
        // `devido` estão fora porque já têm desfecho; `aberto`/`apurado` nunca
        // tiveram cobrança e por isso não têm vencimento.
        inArray(billingCycle.status, ["aguardando_pagamento", "falhou"]),
        // Redundante com a soma abaixo (NULL nunca satisfaz a comparação) e
        // mantido pelo mesmo motivo da #319: é o que deixa o índice
        // `billing_cycle_backstop_idx` utilizável e o predicado legível.
        isNotNull(billingCycle.vencimentoCobranca),
        sql`${billingCycle.vencimentoCobranca} + make_interval(days => ${DIAS_ATE_BACKSTOP}::int) <= ${agoraIso}::timestamptz`,
        // Só assinatura VIVA e ainda não carimbada. `past_due` já tem
        // consequência e relógio próprio (a carência), e agir de novo sobre ela
        // aqui só poderia adiantar um corte por um caminho que não é o da
        // carência. `canceled` já foi cortada.
        eq(subscription.status, "active"),
      ),
    )
    // Mais antigo primeiro, pelo mesmo motivo da #319: com teto, sem ORDER BY
    // cada passada varreria um subconjunto arbitrário e uma linha azarada
    // poderia nunca sair.
    .orderBy(asc(billingCycle.vencimentoCobranca))
    // +1 é sonda, não cota: uma linha ALÉM do teto significa truncamento.
    .limit(TETO_BACKSTOP_POR_PASSADA + 1);

  const truncado = elegiveis.length > TETO_BACKSTOP_POR_PASSADA;
  const avaliaveis = truncado
    ? elegiveis.slice(0, TETO_BACKSTOP_POR_PASSADA)
    : elegiveis;

  if (truncado) {
    console.warn("[billing-backstop-truncado] elegíveis além do teto", {
      teto: TETO_BACKSTOP_POR_PASSADA,
      agora: agoraIso,
    });
  }

  const resultados: ResultadoBackstopPrazo[] = [];
  const marcaTruncado = truncado ? { truncado: true } : {};

  for (const linha of avaliaveis) {
    // Impossível pelo predicado; estreita o tipo sem um `!`.
    if (!linha.vencimento) continue;

    const politica = classificarRecusa(linha.recusaCodigo);
    const base = {
      ...marcaTruncado,
      clinicId: linha.clinicId,
      subscriptionId: linha.subscriptionId,
      cycleId: linha.cycleId,
      vencimento: linha.vencimento,
      recusaCodigo: linha.recusaCodigo,
      grupo: politica.grupo,
    };

    if (politica.grupo === "G6") {
      // Ver "G6 não tem backstop" no cabeçalho. Sai ANTES do dry-run porque
      // não é uma ação suprimida pelo ensaio — é a ausência de ação.
      resultados.push({ ...base, acao: "ignorada_g6" });
      continue;
    }

    // Dry-run responde QUEM seria alcançado e para por aqui: não fala com o
    // gateway e não escreve nada. Mesmo idioma da #319, e pela mesma razão —
    // este caminho pode revogar autorização de Pix Automático.
    if (dryRun) {
      resultados.push({ ...base, acao: "nenhuma" });
      continue;
    }

    // G3: tenta o CORTE, que é a única ação irreversível daqui. Qualquer
    // resposta que não seja "o gateway disse que a autorização está morta"
    // degrada para o carimbo, que é reversível por pagamento.
    if (politica.corteImediato) {
      const veredito = await confirmarAutorizacaoMorta(linha);
      if (veredito.morta) {
        try {
          await revogarECortarAssinatura(linha, agora, {
            motivo: `G3 confirmado no gateway (${linha.recusaCodigo ?? "sem código"})`,
            statusEsperado: "active",
          });
          resultados.push({ ...base, acao: "cortada" });
        } catch (e) {
          resultados.push({
            ...base,
            acao: "nenhuma",
            erro: `[${etapaDoErro(e)}] ${detalharErro(e)}`,
          });
        }
        continue;
      }
      // Cai no carimbo, carregando o motivo de o corte não ter acontecido.
      const carimbo = await carimbarPorPrazo(linha, agora);
      resultados.push({ ...base, ...carimbo, erro: veredito.erro });
      continue;
    }

    const carimbo = await carimbarPorPrazo(linha, agora);
    resultados.push({ ...base, ...carimbo });
  }

  return resultados;
}

/**
 * Leitura pura que decide se o corte do G3 pode acontecer.
 *
 * Só `cancelada` (o adapter mapeia `CANCELLED`/`REFUSED`/`EXPIRED` para lá)
 * autoriza. `autorizada` é o caso em que o CÓDIGO MENTIU: existe autorização
 * viva e o desfecho correto é o de G7 — carimbo. Qualquer outro estado, e
 * qualquer erro de leitura, também barram: o padrão de `mapearStatusAutorizacao`
 * é `pendente`, então status novo do gateway nunca vira permissão para revogar.
 *
 * Nunca lança: o erro vira texto no resultado, e a decisão é sempre "não
 * cortar".
 */
async function confirmarAutorizacaoMorta(assinatura: {
  subscriptionId: string;
  provider: string | null;
  providerSubscriptionId: string | null;
}): Promise<{ morta: boolean; erro?: string }> {
  if (!assinatura.provider || !assinatura.providerSubscriptionId) {
    return {
      morta: false,
      erro: `[g3] assinatura ${assinatura.subscriptionId} sem vínculo consultável no gateway — corte de G3 não confirmado`,
    };
  }

  try {
    const provider = getProviderPorId(assinatura.provider);
    const { status } = await provider.consultarVinculo(
      assinatura.providerSubscriptionId,
    );
    if (status === "cancelada") return { morta: true };
    // Greppável: é a linha que prova, em produção, se o catálogo de G3 é
    // confiável ou se o gateway devolve códigos de autorização morta com a
    // autorização viva.
    console.warn(
      "[billing-backstop-g3] gateway não confirmou autorização morta",
      {
        providerVinculoId: assinatura.providerSubscriptionId,
        status,
      },
    );
    return {
      morta: false,
      erro: `[g3] gateway respondeu \`${status}\`, não \`cancelada\` — corte não confirmado, tratado como G7`,
    };
  } catch (e) {
    return {
      morta: false,
      erro: `[g3] reconsulta da autorização falhou (${detalharErro(e)}) — corte barrado, ciclo tratado como G7`,
    };
  }
}

/**
 * O carimbo em si: ciclo para `falhou`, assinatura para `past_due`.
 *
 * Numa transação só porque as duas escritas são a MESMA decisão: um ciclo
 * `falhou` sem `past_due` não cobra ninguém, e um `past_due` cujo ciclo ficou em
 * `aguardando_pagamento` nunca vira dívida congelada (ver o cabeçalho da
 * varredura).
 *
 * O ciclo é atualizado PRIMEIRO e com compare-and-set. Entre a seleção e aqui
 * cabe o webhook que liquida a cobrança: `liquidarCiclo` leva o ciclo a `pago` e
 * a assinatura continua `active`, então um carimbo que olhasse só a assinatura
 * poria em `past_due` uma clínica que acabou de pagar. Ciclo fora do conjunto
 * elegível ⇒ nada acontece.
 */
async function carimbarPorPrazo(
  linha: { cycleId: string; subscriptionId: string },
  agora: Date,
): Promise<{ acao: AcaoBackstop; erro?: string }> {
  try {
    let carimbou = false;

    await authDb.transaction(async (tx) => {
      const [ciclo] = await tx
        .update(billingCycle)
        .set({
          status: "falhou",
          // `coalesce` e não sobrescrita: o ciclo G3 já foi a `falhou` com o
          // motivo REAL, e trocá-lo pelo texto do backstop apagaria a causa
          // em favor da consequência. `recusa_codigo` nunca é tocado aqui —
          // ele é fato do gateway, e o backstop é decisão nossa.
          erro: sql`coalesce(${billingCycle.erro}, ${ERRO_BACKSTOP})`,
        })
        .where(
          and(
            eq(billingCycle.id, linha.cycleId),
            inArray(billingCycle.status, ["aguardando_pagamento", "falhou"]),
          ),
        )
        .returning({ id: billingCycle.id });

      if (!ciclo) return;

      const [assinatura] = await tx
        .update(subscription)
        .set({
          status: "past_due",
          // O instante do CARIMBO, não a data da recusa: a carência começa
          // quando concluímos que a clínica deve. Escrito sem `??` de
          // propósito — preservar um resíduo de `past_due_desde` numa linha
          // `active` faria a carência nascer vencida, que é a classe de
          // defeito do `cancelada_em` não limpo na reativação (#290).
          pastDueDesde: agora,
          atualizadoEm: agora,
        })
        .where(
          and(
            eq(subscription.id, linha.subscriptionId),
            eq(subscription.status, "active"),
          ),
        )
        .returning({ id: subscription.id });

      carimbou = Boolean(assinatura);
    });

    return carimbou ? { acao: "carimbada" } : { acao: "nenhuma" };
  } catch (e) {
    return { acao: "nenhuma", erro: `[carimbo] ${detalharErro(e)}` };
  }
}

/**
 * Orçamento de retentativa extradia por cobrança, imposto pelo Asaas
 * (`ALLOW_THREE_IN_SEVEN_DAYS`). Passar disto devolve 400
 * (`limite_de_tentativas`), então o contador local existe para nunca chegar lá.
 */
const MAXIMO_RETENTATIVAS_POR_CICLO = 3;

/**
 * Teto de ciclos AVALIADOS pela varredura de retentativa por execução (#322).
 *
 * Mesmo orçamento de 30s do cliente do job que motivou
 * `TETO_CORTES_POR_PASSADA` e `TETO_BACKSTOP_POR_PASSADA`, e o mesmo número
 * pela mesma pior hipótese: cada ciclo elegível faz até TRÊS chamadas
 * sequenciais ao gateway — a consulta da instrução (Guarda 1), a reconsulta da
 * cobrança (Guarda 1b) e o comando da retentativa. A terceira entrou com a
 * proteção contra o débito em duplicidade; o teto não subiu junto de propósito,
 * porque o orçamento que ele guarda é o de TEMPO, e ele encolheu.
 *
 * "Avaliados", e não "comandados": um ciclo que sai por `instrucao_pendente`
 * ou por `sem_data_possivel` consome cota do mesmo jeito, exatamente como o
 * `ignorada_g6` do backstop. Contar só os comandados faria o teto deixar de
 * limitar o tempo da passada, que é a única coisa que ele existe para limitar.
 *
 * O que NÃO entra mais na cota é o inelegível PERMANENTE (grupo que não retenta
 * sozinho, orçamento gasto, vencimento velho demais para qualquer data caber):
 * esses são barrados no `WHERE`, porque um ciclo que nunca muda de estado
 * ocupava vaga em toda passada — para sempre — e a fila não drenava.
 */
export const TETO_RETENTATIVAS_POR_PASSADA = 20;

/**
 * Por que um ciclo elegível a olho nu NÃO teve retentativa comandada.
 *
 * Só entra aqui o que a varredura decide DEPOIS de selecionar a linha. O que o
 * `WHERE` já barra (grupo não retentável, orçamento gasto, vencimento fora da
 * janela grossa) não tem membro nenhum: motivo que nunca sai é código sem
 * oráculo, e o SQL passou a ser a única autoridade daquelas três regras.
 */
export type MotivoNaoComandada =
  /** Guarda 1: já existe instrução a caminho (`AWAITING_REQUEST`/`SCHEDULED`). */
  | "instrucao_pendente"
  /** A cobrança já foi liquidada no gateway — webhook perdido, auto-cura. */
  | "cobranca_ja_liquidada"
  /** Nenhuma data satisfaz as quatro restrições da D-3. */
  | "sem_data_possivel"
  /** A carência desta assinatura vence nesta mesma passada — vai ser cortada. */
  | "carencia_vence_nesta_passada"
  /** Guarda 2 (CAS): outra passada reservou a tentativa primeiro. */
  | "reserva_perdida"
  /** O adapter da linha não modela instrução de débito retentável. */
  | "provedor_sem_suporte"
  /** Ensaio: a linha TERIA sido comandada, e parou por ser `dryRun`. */
  | "dry_run";

export interface ResultadoComandoRetentativa {
  cicloId: string;
  clinicId: string;
  subscriptionId: string;
  providerChargeId: string | null;
  /** Resolvido no gateway a partir da cobrança; `null` quando não se chegou lá. */
  providerInstructionId: string | null;
  recusaCodigo: string | null;
  grupo: GrupoRecusa;
  /** 1..3 — a tentativa RESERVADA. `null` quando nada foi reservado. */
  tentativa: number | null;
  /**
   * `YYYY-MM-DD` calculada para esta passada.
   *
   * Preenchida sempre que o cálculo chegou a uma data — inclusive quando a
   * reserva foi perdida ou o gateway recusou depois. Zerá-la nesses casos
   * esconderia do relatório do job justamente a data que o gateway avaliou,
   * que é o dado com que se investiga um `fora_da_janela_de_7_dias`.
   */
  dueDate: string | null;
  acao: "comandada" | "nao_comandada" | "recusada_pelo_gateway";
  motivo: MotivoNaoComandada | MotivoRecusaDeRetentativa | null;
  truncado: boolean;
  /** Falha de transporte/banco. Não é recusa: a passada segue e retenta amanhã. */
  erro: string | null;
}

/**
 * Varredura de retentativa extradia do Pix Automático (#322).
 *
 * ## Por que VARREDURA e não reação ao webhook (D-1)
 *
 * A validação 3 do Asaas — "o agendamento deve ser enviado até as 23h59 do dia
 * anterior à data desejada" — transforma o horário de execução em parte da
 * regra. Uma varredura que só comanda `dueDate >= amanhã` a satisfaz **por
 * construção**, a qualquer hora do dia. E há três razões que reforçam:
 *
 * - o envelope de recusa que `normalizarEventoAsaas` assume **não foi medido**
 *   (nenhuma autorização chega a `ACTIVE` no sandbox, #321) — pendurar a
 *   recuperação de receita nele é empilhar desenho sobre suposição;
 * - entrega de webhook não é garantida; varredura reavalia o predicado toda
 *   passada e **se auto-cura**, reação a evento perde o caso para sempre;
 * - dois webhooks do mesmo ciclo é o modo de falha que a própria doc do Asaas
 *   nomeia.
 *
 * A contrapartida assumida é até ~1 dia de latência entre a recusa e a 1ª
 * retentativa extradia. Custo real ≈ zero: o dia da recusa já é coberto pela
 * retentativa **intradia**, que o PSP Pagador executa sozinho entre 18h e 21h e
 * que **não consome** nenhuma das 3.
 *
 * ## Só G2 comanda sozinho (D-2), e quem impõe isso é o SQL
 *
 * O gatilho é `retentavelAutomaticamente`, campo próprio da política — nunca
 * `valeGastarRetentativa`, que responde outra pergunta ("vale algum dia?", com
 * um "depois que a clínica agir" colado em G1, G4 e G6). Uma varredura não sobe
 * limite, não corrige cadastro e não conserta bug; reusar aquele campo aqui
 * queimaria em `ACCOUNT_CLOSED` as tentativas que o caso de saldo precisa.
 *
 * A regra mora no `WHERE` (via `CODIGOS_RETENTAVEIS_AUTOMATICAMENTE`), junto com
 * o orçamento de 3 e o piso grosso da janela. Filtrar depois do `LIMIT` fazia o
 * inelegível permanente ocupar vaga em toda passada — e como ele nunca muda de
 * estado, a fila **não drenava**: a recusa nova ficava atrás dele para sempre.
 *
 * ## A cobrança pode já ter sido paga (Guarda 1b)
 *
 * A premissa da D-1 é que webhook se perde. A consequência que faltava tratar é
 * que o ciclo continua `falhou` com o `recusa_codigo` retentável, e a passada
 * seguinte comandaria um SEGUNDO débito da mesma mensalidade. Por isso a
 * varredura reconsulta a cobrança antes de reservar; achando-a paga, concilia
 * (auto-cura) e sai sem gastar tentativa.
 *
 * ## A ordem é reserva → chamada → desfecho, o CONTRÁRIO da #319 (D-4)
 *
 * A #319 estabeleceu "gravar o estado por último", para que uma falha parcial
 * deixe a linha dentro do conjunto elegível e a passada seguinte se cure. Aqui
 * a ordem é invertida **de propósito**, e a inversão vale só aqui: lá o efeito
 * era interno e reversível; aqui o efeito é **externo e irreversível** (uma
 * instrução de débito agendada no banco pagador), e a doc do Asaas nomeia a
 * chamada concorrente como modo de falha primário. Reservar depois de chamar
 * significaria duas passadas simultâneas comandando duas retentativas para a
 * mesma cobrança.
 *
 * O custo assumido é que uma falha de rede pode consumir 1 das 3 tentativas sem
 * ter comandado nada. **Esse custo não trava o ciclo**: a elegibilidade continua
 * sendo `contador < 3 ∧ sem instrução pendente ∧ existe data possível`, então a
 * passada seguinte segue tentando com o orçamento restante. Perde-se uma
 * tentativa, nunca a auto-cura.
 *
 * ## Esgotar as 3 não antecipa nem adia o corte (D-6)
 *
 * A carência de 10 dias foi dimensionada como `7 (janela de retentativa) + 3
 * (folga)`. Quem esgota em D+3 continua com carência até D+10.
 *
 * ⚠️ O esgotamento deixou de aparecer no relatório do job: o ciclo que gastou as
 * 3 é barrado no `WHERE`, e um motivo que nunca sai seria código sem oráculo. A
 * troca é deliberada — a fila drenar vale mais que a linha informativa —, e o
 * contador continua legível em `billing_cycle.retentativas_comandadas`.
 *
 * E o inverso também vale: assinatura cuja carência vence NESTA passada sai com
 * `carencia_vence_nesta_passada` sem chamar o gateway — gastar tentativa em
 * quem vai ser cortado logo em seguida é pagar round-trip por nada. O predicado
 * é o MESMO de `cancelarAssinaturasComCarenciaVencida`, reusado literalmente
 * abaixo em vez de reescrito.
 *
 * Uma clínica que falha não derruba a varredura das outras — mesmo isolamento
 * por linha e mesmo adapter-por-linha (D26) de `fecharCiclosVencendo`, que
 * nunca faz `throw`.
 *
 * ## ⚠️ Duas coisas NÃO MEDIDAS de que esta varredura depende
 *
 * **(a) O teto B lê `subscription.ciclo_atual_fim` como "início do próximo
 * ciclo", e o alinhamento entre a recorrência do Asaas e o ciclo do Iris nunca
 * foi medido.** A dedução é que, quando a cobrança é emitida,
 * `fecharCiclosVencendo` já avançou a assinatura, então `ciclo_atual_fim` é a
 * próxima virada. Se na prática a coluna estiver um ciclo ATRÁS da recorrência
 * do gateway, o teto B barra tudo e a varredura devolve `sem_data_possivel` para
 * sempre; se estiver um ciclo À FRENTE, toda retentativa volta 400
 * `colide_com_proximo_ciclo` — com a tentativa já reservada, ou seja, queimando
 * o orçamento das três. O sinal de qualquer um dos dois é o motivo nomeado no
 * relatório do job; o ensaio em produção é quem mede.
 *
 * **(b) `purpose` e `retryAttempt` nunca apareceram em payload real.** O
 * normalizador os lê de `paymentInstruction`, mas nenhuma autorização de Pix
 * Automático chega a `ACTIVE` no sandbox (#321) — então o guard da D-5, que
 * depende de `proposito === "RETRY_AFTER_DUE_DATE"`, nunca foi exercido contra
 * um envelope do gateway. Se os campos vierem com outro nome, o guard some em
 * silêncio e a conciliação volta ao comportamento pré-#322.
 */
export async function comandarRetentativasPendentes(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoComandoRetentativa[]> {
  const agora = opcoes?.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const dryRun = opcoes?.dryRun ?? false;

  const elegiveis = await authDb
    .select({
      cycleId: billingCycle.id,
      clinicId: billingCycle.clinicId,
      subscriptionId: billingCycle.subscriptionId,
      providerChargeId: billingCycle.providerChargeId,
      recusaCodigo: billingCycle.recusaCodigo,
      vencimento: billingCycle.vencimentoCobranca,
      retentativasComandadas: billingCycle.retentativasComandadas,
      ultimaRetentativaVencimento: billingCycle.ultimaRetentativaVencimento,
      provider: subscription.provider,
      // Início do PRÓXIMO ciclo da recorrência, e é ele mesmo: quando a cobrança
      // é emitida, `fecharCiclosVencendo` já avançou a assinatura para o ciclo
      // seguinte, então o ciclo que falhou é o ANTERIOR e `ciclo_atual_inicio`
      // é uma data no passado. O teto B da D-3 é a próxima virada, que é
      // `ciclo_atual_fim`.
      proximoCicloInicio: subscription.cicloAtualFim,
      // Predicado da carência COPIADO de `cancelarAssinaturasComCarenciaVencida`
      // em vez de reescrito: são a mesma regra, e duas cópias que divergem
      // fariam a varredura gastar tentativa exatamente em quem o corte leva na
      // mesma passada. `carencia_dias` sai da LINHA, nunca de constante local.
      //
      // O `status = 'past_due'` é parte da cópia, e não decoração: sem ele um
      // `past_due_desde` residual numa assinatura que voltou para `active`
      // faria esta varredura recusar-se a retentar por um corte que o outro
      // predicado — que exige `past_due` — jamais executaria. É a mesma classe
      // de defeito do `cancelada_em` não limpo na reativação (#290).
      carenciaVenceNestaPassada: sql<boolean>`${subscription.status} = 'past_due' AND ${subscription.pastDueDesde} IS NOT NULL AND ${subscription.pastDueDesde} + make_interval(days => ${subscription.carenciaDias}) <= ${agoraIso}::timestamptz`,
      /**
       * Teto C da `dueDate`: o INSTANTE em que o corte por carência acontece
       * (`past_due_desde + carencia_dias`), ou `null` quando não há carência
       * correndo.
       *
       * Medido no mesmo `make_interval` do predicado acima, e não em
       * milissegundos no JS, para que não existam duas réguas do mesmo prazo.
       *
       * O `mapWith` NÃO é zelo: expressão crua no `select` do Drizzle volta pelo
       * caminho `.values()` do postgres-js **sem decodificação**, ou seja, o
       * timestamptz chega como a string `2026-08-20 12:00:00+00`. Sem ele o
       * `civilSp` do teto C recebia texto e estourava `Invalid time value`
       * (medido).
       */
      cortePorCarencia:
        sql`CASE WHEN ${subscription.status} = 'past_due' AND ${subscription.pastDueDesde} IS NOT NULL THEN ${subscription.pastDueDesde} + make_interval(days => ${subscription.carenciaDias}) END`.mapWith(
          (valor: unknown): Date | null =>
            valor === null || valor === undefined
              ? null
              : new Date(String(valor)),
        ),
    })
    .from(billingCycle)
    .innerJoin(subscription, eq(subscription.id, billingCycle.subscriptionId))
    .where(
      and(
        // Só o ciclo que JÁ falhou: retentativa extradia é sobre instrução
        // recusada. `aguardando_pagamento` ainda não teve recusa nenhuma.
        eq(billingCycle.status, "falhou"),
        // Sem cobrança no gateway não há instrução a retentar.
        isNotNull(billingCycle.providerChargeId),
        // Sem vencimento persistido o teto A (`vencimento + 7 dias corridos`)
        // é imensurável, e recalculá-lo mediria de uma data que nunca foi
        // enviada a gateway nenhum (ver o docblock da coluna em `schema.ts`).
        // Fail-closed: fora do conjunto.
        isNotNull(billingCycle.vencimentoCobranca),
        // Assinatura VIVA. `canceled` já foi cortada e teve a autorização de
        // Pix Automático revogada — comandar retentativa ali seria pedir débito
        // de quem o produto já desligou, e a chamada só poderia voltar 400.
        inArray(subscription.status, ["active", "past_due"]),
        // ── Os três filtros do inelegível PERMANENTE ────────────────────────
        //
        // Moravam no laço, DEPOIS do `LIMIT`, e é por isso que estão aqui
        // agora: um ciclo que nunca vai ser comandado também nunca muda de
        // estado, então ele reaparecia na frente da fila em toda passada, para
        // sempre, ocupando uma das 20 vagas — e a recusa G2 de hoje, que fica
        // atrás dele na ordem por vencimento, jamais chegava a ser avaliada.
        //
        // Só G2 comanda sozinho (D-2). A lista de códigos é derivada do
        // `CATALOGO` da política, nunca redigitada aqui.
        inArray(billingCycle.recusaCodigo, CODIGOS_RETENTAVEIS_AUTOMATICAMENTE),
        // O orçamento de 3 do `ALLOW_THREE_IN_SEVEN_DAYS`, pela MESMA constante
        // que o resto do arquivo usa — um `3` literal no SQL seria a segunda
        // régua do mesmo limite.
        lt(billingCycle.retentativasComandadas, MAXIMO_RETENTATIVAS_POR_CICLO),
        /**
         * Pré-filtro GROSSO da janela de 7 dias corridos.
         *
         * A autoridade sobre a `dueDate` continua sendo `calcularDueDateDeRetentativa`
         * — este predicado é só DRENAGEM DE FILA, e por isso só pode errar para
         * o lado conservador: ele nunca pode excluir uma linha que a função pura
         * aceitaria. O piso é exatamente a fronteira dela: a candidata mínima é
         * `hoje + 1`, o teto A é `vencimento + 7 dias corridos`, logo nenhum
         * vencimento anterior a `hoje - 6` admite data possível — e um que caia
         * exatamente em `hoje - 6` ainda admite.
         *
         * `hoje` é o dia civil de SÃO PAULO, e o piso é o INÍCIO desse dia:
         * comparar contra meio-dia UTC (a normalização de `civilSp`) deixaria de
         * fora as cobranças vencidas na madrugada brasileira do dia limítrofe.
         *
         * Os 6 dias são `JANELA_RETENTATIVA_DIAS_CORRIDOS - 1`, derivados da
         * mesma constante que a função pura usa: um `6` literal aqui viraria a
         * segunda régua da janela, e mexer numa deixaria a outra parada.
         */
        sql`${billingCycle.vencimentoCobranca} >= ((date_trunc('day', ${agoraIso}::timestamptz AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => ${JANELA_RETENTATIVA_DIAS_CORRIDOS - 1})) AT TIME ZONE 'America/Sao_Paulo')`,
      ),
    )
    // Mais antigo primeiro, pela mesma razão da #318/#319: com teto, sem ORDER
    // BY cada passada varreria um subconjunto arbitrário e uma linha azarada
    // poderia nunca sair. É também a ordem do índice `billing_cycle_backstop_idx`.
    .orderBy(asc(billingCycle.vencimentoCobranca))
    // +1 é sonda, não cota: uma linha ALÉM do teto significa truncamento.
    .limit(TETO_RETENTATIVAS_POR_PASSADA + 1);

  const truncado = elegiveis.length > TETO_RETENTATIVAS_POR_PASSADA;
  const avaliaveis = truncado
    ? elegiveis.slice(0, TETO_RETENTATIVAS_POR_PASSADA)
    : elegiveis;

  if (truncado) {
    console.warn(
      "[billing-retentativa-truncado] elegíveis além do teto da passada",
      { teto: TETO_RETENTATIVAS_POR_PASSADA, agora: agoraIso },
    );
  }

  const resultados: ResultadoComandoRetentativa[] = [];

  for (const linha of avaliaveis) {
    // Impossíveis pelo predicado; estreitam o tipo sem um `!`.
    if (!linha.providerChargeId || !linha.vencimento) continue;

    const politica = classificarRecusa(linha.recusaCodigo);
    // `acao`/`motivo` ficam DE FORA do comum: são exatamente o que cada saída
    // decide, e um default aqui deixaria uma saída esquecida sair com a ação
    // errada em vez de erro de compilação.
    const base: Omit<ResultadoComandoRetentativa, "acao" | "motivo"> = {
      truncado,
      cicloId: linha.cycleId,
      clinicId: linha.clinicId,
      subscriptionId: linha.subscriptionId,
      providerChargeId: linha.providerChargeId,
      providerInstructionId: null,
      recusaCodigo: linha.recusaCodigo,
      grupo: politica.grupo,
      tentativa: null,
      dueDate: null,
      erro: null,
    };

    const naoComandada = (
      motivo: MotivoNaoComandada,
    ): ResultadoComandoRetentativa => ({
      ...base,
      acao: "nao_comandada",
      motivo,
    });

    if (linha.carenciaVenceNestaPassada) {
      resultados.push(naoComandada("carencia_vence_nesta_passada"));
      continue;
    }

    const dueDate = calcularDueDateDeRetentativa({
      agora,
      vencimentoCobranca: linha.vencimento,
      proximoCicloInicio: linha.proximoCicloInicio,
      ultimaRetentativaVencimento: linha.ultimaRetentativaVencimento,
      cortePorCarencia: linha.cortePorCarencia,
    });

    if (!dueDate) {
      resultados.push(naoComandada("sem_data_possivel"));
      continue;
    }

    // Dry-run responde QUEM seria comandado e para por aqui: não fala com o
    // gateway e não escreve nada. Mesmo idioma da #318/#319 — e aqui a razão é
    // ainda mais direta, porque a Guarda 2 GRAVA antes de chamar: um ensaio que
    // fosse além deste ponto consumiria tentativa de verdade.
    if (dryRun) {
      // O motivo é NOMEADO: `null` aqui punha a linha que TERIA sido comandada
      // no mesmo balde da que foi pulada por falha muda, e o relatório do
      // ensaio — que é o único produto do dry-run — não distinguia as duas.
      resultados.push({
        ...base,
        dueDate,
        acao: "nao_comandada",
        motivo: "dry_run",
      });
      continue;
    }

    // `provider` é nullable desde a 0090 ("sem vínculo de cobrança"), e aqui a
    // linha TEM cobrança emitida — nulo é estado impossível. Sai como falta de
    // suporte em vez de estourar: um dado corrompido numa clínica não pode
    // derrubar a passada das outras.
    if (!linha.provider) {
      resultados.push(naoComandada("provedor_sem_suporte"));
      continue;
    }

    try {
      // Adapter resolvido POR LINHA (D26), nunca pela env: a varredura cobre
      // assinaturas de gateways diferentes na mesma passada. Dentro do `try`
      // porque `getProviderPorId` estoura em `provider` fora do enum.
      const provider = getProviderPorId(linha.provider);

      // Os dois métodos são um par indivisível — sem `instrucaoParaRetentativa`
      // não existe o argumento de `comandarRetentativa`. Verificado ANTES da
      // reserva: gastar tentativa por um provedor que não sabe comandar seria
      // queimar orçamento sem nunca ter chamado ninguém.
      if (!provider.comandarRetentativa || !provider.instrucaoParaRetentativa) {
        resultados.push(naoComandada("provedor_sem_suporte"));
        continue;
      }

      // ── Guarda 1 (D-4): instrução já a caminho ──────────────────────────
      const instrucao = await provider.instrucaoParaRetentativa(
        linha.providerChargeId,
      );
      if (instrucao.pendente) {
        resultados.push(naoComandada("instrucao_pendente"));
        continue;
      }
      if (!instrucao.providerInstructionId) {
        // Nem pendente nem recusada: não há o que retentar. Não vira motivo
        // nomeado porque não é decisão da varredura — é o gateway dizendo que
        // esta cobrança não tem instrução de débito nenhuma (cobrança de Pix
        // comum, por exemplo). Vai como `erro` para aparecer no relatório sem
        // ser confundido com uma guarda nossa.
        resultados.push({
          ...base,
          dueDate,
          acao: "nao_comandada",
          motivo: null,
          erro: "cobrança sem instrução de débito recusada no gateway",
        });
        continue;
      }

      // ── Guarda 1b: a cobrança já LIQUIDOU? ──────────────────────────────
      //
      // A Guarda 1 pergunta se há instrução a caminho; nenhuma pergunta se o
      // dinheiro já entrou. E a D-1 assume explicitamente que webhook se perde
      // — é o argumento inteiro a favor da varredura. Sem esta consulta, um
      // `PAYMENT_RECEIVED` que não chegou deixa o ciclo em `falhou` com
      // `recusa_codigo = PAYMENT_OVERDUE`, ou seja, dentro do conjunto
      // elegível, e a passada seguinte comanda um SEGUNDO débito da mesma
      // mensalidade na conta da clínica.
      //
      // ⚠️ "Cobrança já liquidada" NÃO está entre as cinco validações
      // documentadas do `POST .../retries` (data no passado, data repetida,
      // fora dos 7 dias, colisão com o próximo ciclo, autorização sem política)
      // — não há garantia nenhuma de que o gateway recusaria o débito
      // duplicado. A proteção é NOSSA, e é por isso que ela vem antes da
      // reserva em vez de depender do 400.
      //
      // Achar a cobrança paga também CURA o estado: `conciliarPagamentoDeCiclo`
      // é o mesmo caminho do webhook, então o ciclo vira `pago` e a assinatura
      // sai de `past_due` — a auto-cura que a D-1 promete, agora exercida.
      const cobranca = await provider.consultarCobranca(linha.providerChargeId);
      if (cobranca.status === "paga") {
        await conciliarPagamentoDeCiclo(linha.providerChargeId, "paga");
        resultados.push({
          ...naoComandada("cobranca_ja_liquidada"),
          dueDate,
        });
        continue;
      }

      // ── Guarda 2 (D-4): reserva por compare-and-set, ANTES de chamar ────
      const tentativa = linha.retentativasComandadas + 1;
      const reservadas = await authDb
        .update(billingCycle)
        .set({
          retentativasComandadas: tentativa,
          ultimaRetentativaEm: agora,
          ultimaRetentativaVencimento: dueDate,
        })
        .where(
          and(
            eq(billingCycle.id, linha.cycleId),
            // O CAS em si. Zero linhas ⇒ outra passada reservou entre o SELECT
            // e este UPDATE, e ela é quem vai chamar o gateway.
            eq(
              billingCycle.retentativasComandadas,
              linha.retentativasComandadas,
            ),
          ),
        )
        .returning({ id: billingCycle.id });

      if (reservadas.length === 0) {
        resultados.push({
          ...naoComandada("reserva_perdida"),
          dueDate,
        });
        continue;
      }

      const desfecho = await provider.comandarRetentativa(
        instrucao.providerInstructionId,
        dueDate,
      );

      if (!desfecho.ok) {
        // O gateway RESPONDEU e disse não — decisão definitiva. A tentativa
        // fica gasta de propósito: insistir na mesma passada repetiria a mesma
        // recusa, e o motivo nomeado é o que faz a validação estourada aparecer
        // no relatório do job em vez de virar linha muda.
        resultados.push({
          ...base,
          providerInstructionId: instrucao.providerInstructionId,
          tentativa,
          dueDate,
          acao: "recusada_pelo_gateway",
          motivo: desfecho.motivo,
          erro: desfecho.mensagemGateway,
        });
        continue;
      }

      resultados.push({
        ...base,
        providerInstructionId: instrucao.providerInstructionId,
        tentativa,
        dueDate,
        acao: "comandada",
        motivo: null,
      });
    } catch (e) {
      // Rede, timeout, 5xx, banco. Não derruba a passada — mesmo isolamento por
      // linha de `fecharCiclosVencendo`, que nunca faz `throw`. Se a exceção
      // veio DEPOIS da reserva, uma das 3 tentativas foi gasta sem comandar; é
      // o custo declarado da D-4, e a passada seguinte segue com o restante.
      resultados.push({
        ...base,
        dueDate,
        acao: "nao_comandada",
        motivo: null,
        erro: detalharErro(e),
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
 * ou vencida carimba `past_due` + `pastDueDesde`. O carimbo é o marco zero da
 * carência (`subscription.carencia_dias`); quem a lê e leva a `canceled` é a
 * varredura `cancelarAssinaturasComCarenciaVencida` (#319), no mesmo job de
 * fechamento — não este caminho, que só produz o estado.
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

/**
 * Liquida o ciclo: `pago`, cascata do débito agrupado e saída de `past_due`.
 *
 * Extraído para ser chamado por DOIS caminhos que precisam ser idênticos: o
 * pagamento confirmado (`status === "paga"`) e o **G8** da #318
 * (`PAYMENT_ALREADY_DONE`, a cobrança já estava liquidada quando o gateway
 * recusou o débito). Duplicar as três escritas faria o G8 conciliar "quase"
 * como pago — e o pedaço que faltasse seria exatamente o que gera dívida contra
 * clínica adimplente.
 */
async function liquidarCiclo(
  cicloId: string,
  subscriptionId: string,
  agora: Date,
): Promise<void> {
  await authDb
    .update(billingCycle)
    .set({ status: "pago", cobradoEm: agora, erro: null })
    .where(eq(billingCycle.id, cicloId));

  // Liquidação em cascata do débito agrupado (#290, coluna da 0098).
  //
  // Uma cobrança de débito pode cobrir N ciclos `devido`: o valor é a soma, o
  // id da cobrança fica na ÂNCORA (o ciclo mais antigo) porque
  // `provider_charge_id` é UNIQUE parcial, e os demais apontam para ela. Sem
  // esta cascata a clínica pagaria o total e continuaria devendo todos os
  // ciclos menos um — com o gate de reativação barrando quem já pagou.
  //
  // Idempotente por construção: reescrever `pago` com `pago` é no-op, então a
  // reentrega do webhook não muda nada.
  await authDb
    .update(billingCycle)
    .set({ status: "pago", cobradoEm: agora, erro: null })
    .where(eq(billingCycle.debitoAgrupadoEm, cicloId));

  // Pagamento em dia tira a assinatura de `past_due` — e só o pagamento faz
  // isso. `pastDueDesde` volta a NULL para que uma inadimplência futura
  // recomece a carência do zero.
  //
  // O `eq(status,'past_due')` também é o que garante que **pagar o débito não
  // reativa** (#290): a assinatura `canceled` continua `canceled` depois de
  // quitar. Quitar destrava o gate; voltar continua sendo um ato explícito da
  // clínica, com autorização nova de Pix Automático.
  await authDb
    .update(subscription)
    .set({ status: "active", pastDueDesde: null, atualizadoEm: agora })
    .where(
      and(
        eq(subscription.id, subscriptionId),
        eq(subscription.status, "past_due"),
      ),
    );
}

/**
 * "Este evento é a instrução original do ciclo, ou uma retentativa extradia?"
 *
 * Default de TODO call site que não sabe responder — e é o mesmo objeto que
 * `EventoWebhookNormalizado.retentativa` traz quando o gateway não modela
 * instrução (ver o dublê e o normalizador). Com os dois campos `null` a
 * conciliação se comporta exatamente como antes da #322, que é o que preserva
 * os chamadores existentes.
 */
const SEM_RETENTATIVA: EventoWebhookNormalizado["retentativa"] = {
  proposito: null,
  tentativa: null,
};

/**
 * @param retentativa onde este evento cai dentro da política `3R_7D` (#322,
 *   D-5), lido de `paymentInstruction` pelo normalizador.
 *
 * ## O guard da retentativa: recusa de RETENTATIVA não recarimba nada
 *
 * Uma recusa com `proposito === "RETRY_AFTER_DUE_DATE"` sobre um ciclo que já
 * está `falhou` **pelo mesmo grupo** não reescreve `erro` nem `recusa_codigo` e
 * **não** recarimba `past_due`. É a mesma regra que já protege G6 logo abaixo, e
 * pelo mesmo motivo: o diagnóstico correto é o da recusa ORIGINAL (a falta de
 * saldo que motivou a retentativa), e a retentativa que falhou pelo mesmo motivo
 * só repetiria o carimbo.
 *
 * **"Pelo mesmo grupo" é condição, não adorno.** Entre a recusa original e a
 * retentativa a clínica pode ter revogado a autorização no app do banco, e aí a
 * retentativa volta com causa NOVA (G3, `corteImediato`). Um guard que olhasse
 * só o propósito engoliria esse fato: `recusa_codigo` ficaria em
 * `PAYMENT_OVERDUE` e o backstop de prazo, que decide lendo essa coluna, nunca
 * veria o G3. Grupo diferente segue o caminho normal e reescreve o estado.
 *
 * **Sem isto o mesmo ciclo é carimbado até 3 vezes** — uma por retentativa da
 * política `ALLOW_THREE_IN_SEVEN_DAYS` —, cada passagem reescrevendo `erro` e
 * `recusa_codigo` com o que a última tentativa devolveu e reemitindo o
 * `UPDATE subscription` de `past_due`. O relógio da carência sobrevive por
 * acidente (o `?? agora` só grava na entrada); tudo o mais é ruído gravado por
 * cima do fato.
 *
 * O guard fica **depois** de `conciliaComoPago`, de propósito: um
 * `PAYMENT_ALREADY_DONE` que chega numa retentativa continua liquidando o
 * ciclo. Sair antes trocaria a única boa notícia do fluxo por silêncio.
 *
 * **Pagamento** com `RETRY_AFTER_DUE_DATE` liquida normalmente, sem ramo
 * nenhum: é a receita recuperada, e é o desfecho que justifica a #322 inteira.
 */
export async function conciliarPagamentoDeCiclo(
  providerChargeId: string,
  status: StatusCobranca,
  motivoRecusa: string | null = null,
  retentativa: EventoWebhookNormalizado["retentativa"] = SEM_RETENTATIVA,
): Promise<boolean> {
  const agora = new Date();

  const [ciclo] = await authDb
    .select({
      id: billingCycle.id,
      subscriptionId: billingCycle.subscriptionId,
      status: billingCycle.status,
      // Lido porque o guard da retentativa (D-5) compara o GRUPO da recusa nova
      // com o da recusa já registrada: sem a coluna, o guard só conseguiria
      // perguntar "é retentativa?" e engoliria causa diferente.
      recusaCodigo: billingCycle.recusaCodigo,
    })
    .from(billingCycle)
    .where(eq(billingCycle.providerChargeId, providerChargeId))
    .limit(1);

  if (!ciclo) return false;

  if (status === "paga") {
    await liquidarCiclo(ciclo.id, ciclo.subscriptionId, agora);
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
     * explícito do gateway trocaria uma por outra.
     *
     * ⚠️ ATUALIZADO PELA #318: a hipótese do teto **deixou de ser escrita**. O
     * ramo `null` não grava mais o texto que ranqueava "teto, depois saldo" —
     * ele agora é G0, e G0 não move estado nenhum. Escrever uma causa provável
     * como se fosse diagnóstico é exatamente o que a coluna `recusa_codigo`
     * existe para acabar. Enquanto `motivoRecusa` chegar `null` em produção
     * (D35 não medido em prod), o sinal é a linha `[billing-recusa-desconhecida]`
     * — e nada mais acontece.
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
    /**
     * #318 — o desfecho passa a depender do MOTIVO. Antes daqui os 25 códigos
     * publicados caíam no mesmo lugar (`falhou` + `past_due`): o motivo chegava,
     * era interpolado num texto e descartado na decisão. A política governa as
     * três decisões que eram incondicionais logo abaixo — o texto do `erro`, se
     * o ciclo vai a `falhou`, e se o bloco de carimbo de `past_due` roda — mais
     * a conciliação como pago do G8.
     *
     * `motivoRecusa` desconhecido, ou `null`, é **G0**: não pune a clínica no
     * ato, porque não prova nada sobre ela. Ver `classificacao-recusa.ts`.
     */
    const politica = classificarRecusa(motivoRecusa);

    // Log com tag fixa e greppável: é por ele que a primeira recusa real de
    // produção vira sinal em vez de linha morta na tabela. O grupo entra junto
    // porque é ele que explica por que o estado mudou (ou não mudou).
    console.warn("[billing-recusa] cobrança de ciclo recusada", {
      providerChargeId,
      motivoRecusa,
      grupo: politica.grupo,
    });

    if (politica.grupo === "G0") {
      // Tag PRÓPRIA, e não a de cima: é assim que "o catálogo cresceu" vira
      // trabalho agendado em vez de incidente. O literal recebido vai junto —
      // é o único jeito de descobrir o código novo.
      //
      // `motivoRecusa: null` aqui NÃO é um código novo: é o D35 ainda vazio em
      // produção (sem id de instrução, o adapter não tem onde buscar o motivo).
      // Enquanto essa linha aparecer com `null`, a classificação inteira está
      // rodando às cegas e NENHUMA recusa produz consequência.
      console.warn(
        "[billing-recusa-desconhecida] código fora do catálogo da #318",
        { providerChargeId, motivoRecusa },
      );
    }

    if (politica.conciliaComoPago) {
      // G8 (`PAYMENT_ALREADY_DONE`): a cobrança FOI liquidada. Não é falha, é
      // conciliação perdida — e o caminho antigo gerava dívida congelada contra
      // clínica adimplente, com o gate da #290 barrando quem já tinha pago.
      await liquidarCiclo(ciclo.id, ciclo.subscriptionId, agora);
      return true;
    }

    if (
      retentativa.proposito === "RETRY_AFTER_DUE_DATE" &&
      ciclo.status === "falhou" &&
      // A recusa NOVA tem que ser do MESMO grupo da recusa já registrada.
      politica.grupo === classificarRecusa(ciclo.recusaCodigo).grupo &&
      // ...e nunca se engole um grupo cujo desfecho é o corte.
      !politica.corteImediato
    ) {
      // #322 (D-5). Ver o guard descrito no cabeçalho desta função: o
      // diagnóstico que vale é o da recusa ORIGINAL, e este ramo existe para
      // não deixar a 2ª e a 3ª retentativa reescreverem por cima dele.
      //
      // `ciclo.status === "falhou"` é parte da condição, e não um detalhe: uma
      // retentativa sobre ciclo `aguardando_pagamento` significa que a recusa
      // original NÃO foi registrada (webhook perdido, ou reconsulta que
      // discordou), e aí a recusa da retentativa é o único diagnóstico que
      // existe — deixar passar é o que faz a varredura se auto-curar.
      //
      // ⚠️ A comparação de GRUPO é o que impede o guard de engolir uma causa
      // NOVA. A retentativa não repete só o resultado: entre a recusa original
      // e ela, a clínica pode ter revogado a autorização no app do banco. Aí a
      // retentativa volta G3 (`corteImediato`) e, sem esta condição, o guard
      // descartava o fato — `recusa_codigo` continuava `PAYMENT_OVERDUE` e
      // `aplicarBackstopDePrazo`, que lê exatamente essa coluna, nunca via o
      // G3. O mesmo vale para G5/G1: a copy seguiria dizendo "sem saldo" para
      // uma conta encerrada ou um teto baixo.
      //
      // Grupo IGUAL é a única situação em que não se perde informação: a 2ª e a
      // 3ª tentativa falharam pelo mesmo motivo da 1ª, e reescrever só trocaria
      // o carimbo por um carimbo idêntico.
      console.warn("[billing-recusa] recusa de RETENTATIVA preservada", {
        providerChargeId,
        motivoRecusa,
        grupo: politica.grupo,
        tentativa: retentativa.tentativa,
      });
      return true;
    }

    if (!politica.marcaCicloFalhou) {
      // G6 (defeito nosso), G7 (falha do banco) e G0 (desconhecido) não movem
      // estado NENHUM, e isso inclui não reescrever `erro`/`recusa_codigo`: uma
      // retentativa nossa mal emitida chega DEPOIS da recusa de saldo que já
      // gravou o diagnóstico certo, e sobrescrevê-lo trocaria a causa real pelo
      // nosso bug.
      //
      // ⚠️ Enquanto o backstop de D+7 (Decisão 2 da #318) não existir, G7 e G0
      // não produzem consequência nenhuma. É buraco de receita conhecido e
      // sequenciado — não subir para produção sem ele.
      //
      // D39 — G6 é a EXCEÇÃO a "não escreve nada": se este ciclo ainda não tem
      // `recusa_codigo` (é a PRIMEIRA recusa dele), persiste o código cru só
      // para o backstop de D+7 conseguir classificar G6 e ignorar (em vez de
      // ler `null` como G0 e carimbar `past_due` por um bug nosso). Não move
      // `status`/`erro` — o ciclo segue sem diagnóstico de falha, exatamente
      // como antes. Se já existe `recusa_codigo` (recusa de saldo anterior já
      // gravada), não sobrescreve — é a mesma proteção de sempre.
      if (politica.grupo === "G6" && !ciclo.recusaCodigo) {
        await authDb
          .update(billingCycle)
          .set({ recusaCodigo: motivoRecusa })
          .where(eq(billingCycle.id, ciclo.id));
      }
      return true;
    }

    const erro = `${politica.diagnostico} [${politica.grupo}]${
      motivoRecusa ? ` (código do gateway: ${motivoRecusa})` : ""
    }`;

    await authDb
      .update(billingCycle)
      .set({
        status: "falhou",
        erro,
        // O código CRU, do jeito que o gateway mandou (0100). O grupo NÃO é
        // persistido: dele não se recupera o código, e o mapa evolui.
        recusaCodigo: motivoRecusa,
      })
      .where(eq(billingCycle.id, ciclo.id));

    if (!politica.carimbaPastDue) {
      // Hoje só G3 (autorização morta): o desfecho dele é CORTE, não carência.
      // Mas o corte exige reconsultar `GET /pix/automatic/authorizations/{id}`
      // e só vale se o gateway DISSER `CANCELLED`/`EXPIRED`/`REFUSED` — se
      // responder `ACTIVE`, o código mente e o caso é G7. Essa reconsulta não
      // existe neste caminho (aqui não há handle de provider), então G3 registra
      // e espera: o corte fica com o backstop de D+7, que decide com o gateway
      // na mão. Carimbar `past_due` daria à clínica uma tarja de devedora por um
      // problema de autorização, e cortar sem confirmação revogaria autorização
      // viva por um código espúrio — irreversível sem novo consentimento no app
      // do banco.
      return true;
    }

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
        .where(
          and(
            eq(subscription.id, assinatura.id),
            // O corte NÃO pode ser desfeito por não pagar. Sem este guard —
            // espelho do `eq(status,'past_due')` do ramo `paga` acima — a
            // clínica já cortada que pede o débito da #290, não paga e vê a
            // cobrança vencer (`OVERDUE`) voltava de `canceled` para
            // `past_due`: recuperava o direito de escrever (`estado-conta.ts`
            // deixa `past_due` escrever) e ganhava uma carência NOVA de 10
            // dias, tudo por não pagar. Só assinatura VIVA entra em `past_due`.
            //
            // O ciclo em si continua indo para `falhou` (acima): a cobrança
            // falhou de fato, e isso é registro, não status de assinatura.
            inArray(subscription.status, ["active", "past_due"]),
          ),
        );
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

      /**
       * Motivo classificado do desfecho, gravado no carimbo final.
       *
       * #289 — antes desta variável a varredura DESCARTAVA o retorno de
       * `conciliarPagamentoDeCiclo` e carimbava `erro_aplicacao = null` em
       * todo evento que não estourasse exceção. Efeito: reprocessar um evento
       * cuja conciliação falhou **apagava o motivo** que a rota tinha gravado
       * — curava o sintoma (a linha sai da fila) e matava o sinal (some o
       * único registro de que uma cobrança nossa não achou ciclo). E como a
       * varredura é justamente o caminho que roda quando a entrega ao vivo
       * falhou, o alarme sumia no cenário em que ele é mais necessário.
       */
      let erroAplicacao: string | null = null;

      if (normalizado.providerChargeId) {
        // Evento de COBRANÇA de ciclo. Consulta o gateway em vez de confiar
        // no tipo do evento, pela mesma razão de `aplicarStatusProvider`: a
        // notificação costuma vir sem estado nenhum.
        // O id da INSTRUÇÃO vai junto, igual à rota do webhook (D35): o motivo
        // da recusa não é campo da cobrança, mora na instrução. Sem ele o
        // adapter cai no fallback por índice
        // (`?paymentId=…&status=REFUSED`) — uma chamada a mais e um resultado
        // que depende de a listagem trazer a instrução certa. E é aqui que a
        // classificação da #318 mais precisa do motivo: esta varredura é o
        // caminho que roda quando a entrega ao vivo falhou.
        const atual = await provider.consultarCobranca(
          normalizado.providerChargeId,
          { providerInstructionId: normalizado.providerInstructionId },
        );
        // Gêmeo do guard da rota (#286): a varredura aplica o evento quando a
        // entrega ao vivo falhou, e um guard que existe só num dos dois some
        // exatamente no cenário em que o webhook não chegou.
        avisarRecusaQueNaoConciliou(
          normalizado.tipo,
          normalizado.providerChargeId,
          atual.status,
        );
        const aplicou = await conciliarPagamentoDeCiclo(
          normalizado.providerChargeId,
          atual.status,
          atual.motivoRecusa,
          // Gêmeo do repasse na rota do webhook (#322, D-5), e pelo mesmo
          // motivo do guard de `avisarRecusaQueNaoConciliou` logo acima: um
          // guard que existe só num dos dois caminhos some exatamente no
          // cenário em que a entrega ao vivo falhou — que é quando ESTA
          // varredura roda.
          normalizado.retentativa,
        );
        // MESMA função da rota, e não uma segunda cópia: os textos da rota e da
        // varredura já divergiram uma vez (`"evento sem id utilizável"` vs.
        // `"sem id utilizável"`), e um alarme cujo texto depende do caminho que
        // gravou não é pesquisável por igualdade.
        // O id da INSTRUÇÃO vai junto pela mesma razão da rota: o débito mensal
        // headless chega sem objeto `payment`, e classificar só pela referência
        // mandaria a mensalidade para o balde da ativação.
        erroAplicacao = aplicou
          ? null
          : classificarFalhaDeConciliacao(
              normalizado.referenciaExterna,
              normalizado.providerInstructionId,
            );
      } else if (normalizado.providerSubscriptionId) {
        const atual = await provider.consultarVinculo(
          normalizado.providerSubscriptionId,
        );
        const aplicou = await aplicarStatusProvider(
          normalizado.providerSubscriptionId,
          atual.status,
        );
        erroAplicacao = aplicou ? null : MOTIVO_ASSINATURA_DESCONHECIDA;
      } else {
        // Sem id nenhum não há o que aplicar. Marca como aplicado para não
        // reprocessar eternamente um evento que nunca terá efeito.
        await marcar(evento.id, {
          aplicadoEm: new Date(),
          erroAplicacao: MOTIVO_EVENTO_SEM_ID,
        });
        continue;
      }

      await marcar(evento.id, {
        aplicadoEm: new Date(),
        erroAplicacao,
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
