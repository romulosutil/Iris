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
} from "./provider";

/**
 * Estado da assinatura e do ciclo de faturamento (#36).
 *
 * Tudo aqui roda em `authDb` — a conexão da role `iris_auth`, sem GUC de
 * tenant. Não é atalho: o webhook chega do gateway, não de uma sessão de
 * usuário, então não existe tenant para `withTenant` estabelecer. E o job de
 * fechamento varre TODAS as clínicas, o que é justamente o que `withTenant`
 * proíbe. A contrapartida é que `iris_auth` não tem grant em `patient` — a
 * apuração passa obrigatoriamente pela função `billing_apurar_ciclo`
 * (SECURITY DEFINER, migração 0071), que devolve contagem, nunca dado clínico.
 */

/** Ciclo padrão. Fica na coluna `subscription.ciclo_dias` por clínica. */
const CICLO_DIAS_PADRAO = 30;

/**
 * Antecedência da apuração. A regra (#36) é apurar 3 dias antes da renovação,
 * para que o reajuste do valor recorrente chegue ao gateway antes de ele
 * disparar o débito — mandar depois cobraria o valor do mês passado.
 */
export const DIAS_ANTECEDENCIA_APURACAO = 3;

function somarDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Traduz o status do gateway para o estado interno.
 *
 * `pendente` NÃO vira `free_tier`: uma assinatura que já existe no gateway e
 * aguarda autorização é `setup_pending`. Voltar para `free_tier` reabriria o
 * gate do 1º paciente com uma cobrança em voo.
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
 * Abre a cobrança de ativação do 1º paciente: cria a assinatura recorrente no
 * gateway com o valor do Mês 1 e deixa a linha local em `setup_pending`.
 *
 * O paciente NÃO é criado aqui, e o status NÃO vai para `active` aqui — quem
 * promove para `active` é o webhook, depois da confirmação do banco. Confiar no
 * retorno do checkout seria confiar no navegador do cliente: a URL de retorno é
 * navegável à mão.
 *
 * Idempotente por clínica: se já existe assinatura com `provider_subscription_id`
 * e ela ainda está pendente, devolve o checkout existente em vez de criar uma
 * segunda no gateway — dois cliques no botão não viram duas cobranças.
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

  if (existente?.providerSubscriptionId && existente.status === "setup_pending") {
    const atual = await provider.consultarAssinatura(
      existente.providerSubscriptionId,
    );
    // Só reaproveita enquanto continua pendente no gateway. Se já autorizou,
    // cair aqui significa que o webhook atrasou; aplicar o efeito agora é
    // melhor que devolver um checkout de algo já pago.
    if (atual.status === "pendente") {
      return {
        checkoutUrl: existente.providerCustomerId ?? "",
        providerSubscriptionId: existente.providerSubscriptionId,
      };
    }
    await aplicarStatusProvider(existente.providerSubscriptionId, atual.status);
  }

  // Mês 1 = 1 paciente. A calculadora é a fonte única do preço, mesmo para o
  // caso trivial — hardcodar 3900 aqui criaria duas verdades sobre a faixa 1.
  const valorCentavos = calcularMensalidadeCentavos(1);

  const criada = await provider.criarAssinatura({
    assinante: {
      clinicId: pedido.clinicId,
      nomeClinica: pedido.nomeClinica,
      emailResponsavel: pedido.emailResponsavel,
      cpfCnpj: pedido.cpfCnpj,
    },
    valorCentavos,
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
      providerSubscriptionId: criada.providerSubscriptionId,
      // Reaproveitado como cache do checkout para o retry idempotente acima.
      providerCustomerId: criada.checkoutUrl,
      metodoPagamento: pedido.metodo,
      cicloDias: CICLO_DIAS_PADRAO,
    })
    .onConflictDoUpdate({
      target: subscription.clinicId,
      set: {
        status: "setup_pending",
        provider: provider.id,
        providerSubscriptionId: criada.providerSubscriptionId,
        providerCustomerId: criada.checkoutUrl,
        metodoPagamento: pedido.metodo,
        atualizadoEm: new Date(),
      },
    });

  return {
    checkoutUrl: criada.checkoutUrl,
    providerSubscriptionId: criada.providerSubscriptionId,
  };
}

/**
 * Aplica ao estado local o status observado no gateway.
 *
 * Recebe o status CONSULTADO, não o inferido do payload do webhook: a
 * notificação do Mercado Pago frequentemente traz só `{type, action, data:{id}}`,
 * sem estado nenhum. Decidir transição a partir do tipo do evento seria decidir
 * a partir de dado que o gateway não mandou.
 *
 * Retorna `true` se alguma linha mudou — `false` significa assinatura
 * desconhecida (evento de outra conta, ou reentrega após cancelamento).
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
      canceladaEm: novo === "canceled" ? (linha.canceladaEm ?? agora) : linha.canceladaEm,
      // `past_due_desde` só é carimbado na ENTRADA em past_due. Recarimbar a
      // cada reentrega do mesmo evento zeraria a carência para sempre e a
      // assinatura nunca venceria.
      pastDueDesde:
        novo === "past_due" ? (linha.pastDueDesde ?? agora) : null,
      // Ativação abre o primeiro ciclo. Sem isso o job de fechamento não teria
      // por onde varrer e a renovação nunca aconteceria.
      cicloAtualInicio: virandoAtiva ? agora : linha.cicloAtualInicio,
      cicloAtualFim: virandoAtiva
        ? somarDias(agora, linha.cicloDias)
        : linha.cicloAtualFim,
    })
    .where(eq(subscription.id, linha.id));

  if (virandoAtiva) {
    await abrirCiclo(linha.id, linha.clinicId, agora, somarDias(agora, linha.cicloDias));
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
  pacientesContados: number;
  valorCentavos: number;
  reajustado: boolean;
  erro?: string;
}

/**
 * Fechamento de ciclo: apura pacientes ativos, calcula o valor consolidado e
 * reajusta a recorrência no gateway. Roda `DIAS_ANTECEDENCIA_APURACAO` dias
 * antes de cada renovação.
 *
 * Uma clínica que falha NÃO derruba a varredura das outras — o erro é
 * persistido em `billing_cycle.erro` e a função segue. Um `throw` aqui faria a
 * primeira clínica com problema de rede impedir o faturamento de todas as
 * seguintes.
 */
export async function fecharCiclosVencendo(opcoes?: {
  agora?: Date;
  dryRun?: boolean;
}): Promise<ResultadoFechamento[]> {
  const agora = opcoes?.agora ?? new Date();
  const dryRun = opcoes?.dryRun ?? false;
  const limite = somarDias(agora, DIAS_ANTECEDENCIA_APURACAO);
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
        lte(subscription.cicloAtualFim, limite),
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
        .select({ id: billingCycle.id })
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
      const pacientesContados =
        (apuracao as unknown as { total: number }[])[0]?.total ?? 0;
      const valorCentavos = calcularMensalidadeCentavos(pacientesContados);

      let reajustado = false;
      if (!dryRun && assinatura.providerSubscriptionId) {
        await provider.atualizarValorRecorrente(
          assinatura.providerSubscriptionId,
          valorCentavos,
        );
        reajustado = true;
      }

      if (!dryRun) {
        await authDb
          .update(billingCycle)
          .set({ valorCentavos, status: "cobrado", cobradoEm: new Date(), erro: null })
          .where(eq(billingCycle.id, ciclo.id));

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
        pacientesContados,
        valorCentavos,
        reajustado,
      });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      resultados.push({
        clinicId: assinatura.clinicId,
        cycleId: "",
        pacientesContados: 0,
        valorCentavos: 0,
        reajustado: false,
        erro,
      });
    }
  }

  return resultados;
}

/**
 * Reprocessa webhooks recebidos e ainda não aplicados. Existe porque a rota do
 * webhook grava e responde 200 rápido (o Mercado Pago desabilita endpoint
 * lento) — se a aplicação do efeito falhar depois do 200, o gateway não
 * reentrega, e sem esta varredura o evento ficaria perdido.
 */
export async function reprocessarEventosPendentes(
  limite = 50,
): Promise<{ aplicados: number; falhas: number }> {
  const { mercadopagoWebhookEvent } = await import("@/db/schema");
  const provider = getBillingProvider();

  const pendentes = await authDb
    .select()
    .from(mercadopagoWebhookEvent)
    .where(isNull(mercadopagoWebhookEvent.aplicadoEm))
    .limit(limite);

  let aplicados = 0;
  let falhas = 0;

  for (const evento of pendentes) {
    try {
      const normalizado = provider.normalizarEvento(evento.payload);
      if (!normalizado.providerSubscriptionId) {
        // Sem id de assinatura não há o que aplicar. Marca como aplicado para
        // não reprocessar eternamente um evento que nunca terá efeito.
        await authDb
          .update(mercadopagoWebhookEvent)
          .set({ aplicadoEm: new Date(), erroAplicacao: "sem provider_subscription_id" })
          .where(eq(mercadopagoWebhookEvent.id, evento.id));
        continue;
      }
      const atual = await provider.consultarAssinatura(
        normalizado.providerSubscriptionId,
      );
      await aplicarStatusProvider(normalizado.providerSubscriptionId, atual.status);
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({ aplicadoEm: new Date(), erroAplicacao: null })
        .where(eq(mercadopagoWebhookEvent.id, evento.id));
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
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({
          erroAplicacao: e instanceof Error ? e.message : String(e),
          ...(definitiva ? { aplicadoEm: new Date() } : {}),
        })
        .where(eq(mercadopagoWebhookEvent.id, evento.id));
    }
  }

  return { aplicados, falhas };
}
