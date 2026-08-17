import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { asaasWebhookEvent } from "@/db/schema";
import {
  classificarFalhaDeConciliacao,
  MOTIVO_ASSINATURA_DESCONHECIDA,
  MOTIVO_EVENTO_SEM_ID,
} from "@/lib/billing/erro-aplicacao";
import { AsaasProvider } from "@/lib/billing/provider";
import {
  aplicarStatusProvider,
  avisarRecusaQueNaoConciliou,
  conciliarPagamentoDeCiclo,
} from "@/lib/billing/subscription";

/**
 * Webhook do Asaas — Pix Automático (#36, Fase 7).
 *
 * Até 08/08/2026 esta rota só registrava: autenticava, deduplicava, guardava o
 * payload bruto e respondia 200, porque a tabela `subscription` e o motor de
 * apuração ainda não existiam. Os dois existem desde a Fatia B, e a conta de
 * produção do Asaas foi liberada (D12) — então a rota passa a **aplicar o
 * efeito**, exatamente como a do Mercado Pago.
 *
 * O que NÃO mudou, e não pode mudar:
 *
 * - Roda em `authDb` (role `iris_auth`), nunca em `withTenant()`. A requisição
 *   vem do Asaas, não de uma sessão — não há tenant a resolver. E `iris_auth`
 *   não tem grant em `patient`, o que mantém `withTenant()` como gargalo único
 *   de acesso a dado clínico (`src/db/client.ts`).
 * - A dedup é decidida pelo `UNIQUE (asaas_event_id)` do Postgres dentro de UMA
 *   instrução atômica. O Asaas entrega **at least once** e reentrega em
 *   paralelo: `SELECT`-depois-`INSERT` tem janela de corrida, e em faturamento
 *   a corrida perdida é cobrança duplicada.
 * - Resposta idêntica para token errado, token ausente e env não configurada.
 *
 * Três coisas que o Asaas impõe e o Mercado Pago não:
 *
 * 1. **O corpo não é autenticado.** A autenticação é um token fixo no header
 *    `asaas-access-token`, não um HMAC sobre o corpo — quem tiver o token pode
 *    mandar qualquer payload. Por isso o efeito é aplicado a partir de uma
 *    CONSULTA ao gateway pelo id, nunca do estado que veio no evento.
 * 2. **A fila para depois de 15 falhas consecutivas, e evento não entregue some
 *    em 14 dias.** É o que torna proibido devolver 5xx por falha de aplicação:
 *    trocaríamos um efeito atrasado (recuperável pela varredura
 *    `reprocessarEventosPendentes`) por um webhook desligado e por eventos
 *    perdidos de vez.
 * 3. **`AsaasProvider` é instanciado aqui, não resolvido por
 *    `getBillingProvider()`.** Esta rota é a do Asaas: qual gateway está ATIVO
 *    na env não muda quem assinou esta entrega. Durante uma virada de chave os
 *    dois webhooks ficam cadastrados ao mesmo tempo, e resolver pela env faria
 *    o adapter errado tentar verificar o token — 401 em entrega legítima, com a
 *    fila do Asaas caminhando para as 15 falhas.
 *
 * Env necessária (secret no Easypanel — nunca versionar):
 *   ASAAS_WEBHOOK_TOKEN       token que o Asaas devolve no header a cada entrega
 *                             (painel: Integrações → Webhooks → Token)
 *   BILLING_PROVIDER_API_KEY  chave da API, usada nas consultas de conciliação
 */

// node:crypto + driver Postgres: precisa de runtime Node, não edge.
export const runtime = "nodejs";
// Sem cache: é webhook, cada POST é efeito colateral.
export const dynamic = "force-dynamic";

/**
 * `id` do evento no Asaas. Vem como string (`evt_<hex>&<n>` — o `&` é literal,
 * medido no payload real do sandbox), mas aceitamos number por robustez de
 * contrato de terceiro. Vazio/ausente é 400: sem chave não há dedup, e gravar
 * sem chave é pior que recusar.
 */
function extraiTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const provider = new AsaasProvider();

  // Lido como texto para manter a mesma forma da rota do Mercado Pago (onde o
  // corpo cru é obrigatório porque o HMAC é sobre bytes). Aqui não é
  // obrigatório, mas reserializar não pode virar hábito numa rota de webhook.
  let corpoBruto: string;
  try {
    corpoBruto = await request.text();
  } catch {
    return Response.json({ error: "corpo ilegível" }, { status: 400 });
  }

  if (
    !provider.verificarAssinaturaWebhook({
      corpoBruto,
      cabecalhos: request.headers,
      url: request.url,
    })
  ) {
    // Corpo curto e IDÊNTICO para token errado, token ausente e env não
    // configurada: a resposta não pode dizer qual dos três aconteceu.
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    // 400, não 500: corpo malformado não melhora com reentrega.
    return Response.json(
      { error: "corpo inválido (JSON esperado)" },
      { status: 400 },
    );
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const asaasEventId = extraiTexto(p.id);
  const evento = extraiTexto(p.event);
  if (!asaasEventId || !evento) {
    return Response.json(
      { error: "payload sem `id` ou `event`" },
      { status: 400 },
    );
  }

  let eventoId: string;
  try {
    /**
     * Dedup à prova de corrida: quem decide é o `UNIQUE (asaas_event_id)`
     * dentro de UMA instrução atômica. `ON CONFLICT DO NOTHING ... RETURNING`
     * devolve linha só para quem de fato inseriu; zero linhas = alguém chegou
     * antes = duplicado. Preferido a `try/catch` no 23505 porque não custa um
     * roundtrip de erro nem exige acertar o SQLSTATE embrulhado pelo Drizzle.
     */
    const inseridas = await authDb
      .insert(asaasWebhookEvent)
      .values({ asaasEventId, evento, payload })
      .onConflictDoNothing({ target: asaasWebhookEvent.asaasEventId })
      .returning({ id: asaasWebhookEvent.id });

    if (inseridas.length === 0) {
      return Response.json({ received: true, duplicado: true });
    }
    eventoId = inseridas[0]!.id;
  } catch (err) {
    // Falha real de infraestrutura (banco fora) DEVE ser 5xx: aí a reentrega
    // do Asaas é justamente o comportamento desejado.
    console.error("[asaas-webhook] falha ao registrar evento", {
      asaasEventId,
      evento,
      err,
    });
    return Response.json(
      { error: "falha ao registrar evento" },
      { status: 500 },
    );
  }

  // ── A partir daqui a entrega já está durável. Nada abaixo pode virar 5xx. ──
  try {
    const normalizado = provider.normalizarEvento(payload);

    // A cobrança tem precedência sobre o vínculo: é ela que carrega o
    // `cycle:<id>` e é o ÚNICO caminho pelo qual um ciclo vira `pago`. Um
    // evento de instrução de pagamento traz OS DOIS ids (a instrução aponta
    // para a autorização), e tratá-lo como evento de vínculo deixaria a fatura
    // eternamente em `aguardando_pagamento`.
    if (normalizado.providerChargeId) {
      // O id da INSTRUÇÃO vai junto de propósito (D35): o motivo da recusa não
      // é campo da cobrança — mora na instrução de pagamento, e este é o único
      // ponto do fluxo em que o identificador dela existe. Omiti-lo aqui
      // devolve o adapter ao estado em que `motivoRecusa` era `null` sempre.
      const atual = await provider.consultarCobranca(
        normalizado.providerChargeId,
        { providerInstructionId: normalizado.providerInstructionId },
      );
      // #286 — o evento pode dizer "recusa" e a reconsulta discordar. Esse é o
      // desfecho silencioso: nada é gravado e o evento fica carimbado como
      // aplicado. Ver `avisarRecusaQueNaoConciliou`.
      avisarRecusaQueNaoConciliou(
        normalizado.tipo,
        normalizado.providerChargeId,
        atual.status,
      );
      const aplicou = await conciliarPagamentoDeCiclo(
        normalizado.providerChargeId,
        atual.status,
        atual.motivoRecusa,
      );
      await marcar(eventoId, {
        aplicadoEm: new Date(),
        /**
         * #289 — o motivo é CLASSIFICADO, não um texto único.
         *
         * `aplicou === false` significa só "não achei ciclo por
         * `provider_charge_id`", e isso cobre desfechos opostos: a cobrança de
         * ativação do Pix Automático nunca tem ciclo (e nunca terá), enquanto
         * uma mensalidade nossa sem ciclo é dinheiro recebido e não conciliado.
         *
         * Quem separa os dois são DOIS fatos do envelope, nesta ordem: o id da
         * INSTRUÇÃO (trilho headless do débito mensal, que chega sem objeto
         * `payment` e portanto sem referência nenhuma) e, na ausência dele, a
         * NOSSA `externalReference` — ver `classificarFalhaDeConciliacao`.
         */
        erroAplicacao: aplicou
          ? null
          : classificarFalhaDeConciliacao(
              normalizado.referenciaExterna,
              normalizado.providerInstructionId,
            ),
      });
    } else if (normalizado.providerSubscriptionId) {
      const atual = await provider.consultarVinculo(
        normalizado.providerSubscriptionId,
      );
      const aplicou = await aplicarStatusProvider(
        normalizado.providerSubscriptionId,
        atual.status,
      );
      await marcar(eventoId, {
        aplicadoEm: new Date(),
        // Vínculo desconhecido não é erro de infra: pode ser evento de outra
        // aplicação apontada para o mesmo endpoint, ou um evento de
        // elegibilidade da conta (`PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED`),
        // que não tem assinatura nenhuma. Fica registrado como motivo, sem
        // repetir a consulta para sempre.
        erroAplicacao: aplicou ? null : MOTIVO_ASSINATURA_DESCONHECIDA,
      });
    } else {
      await marcar(eventoId, {
        aplicadoEm: new Date(),
        erroAplicacao: MOTIVO_EVENTO_SEM_ID,
      });
    }
  } catch (err) {
    // Efeito não aplicado, entrega preservada: `aplicado_em` continua NULL e a
    // varredura de pendentes tenta de novo. Registrar o erro e responder 200.
    console.error("[asaas-webhook] falha ao aplicar efeito", {
      asaasEventId,
      err,
    });
    try {
      await marcar(eventoId, {
        erroAplicacao: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Se nem o registro do erro grava, o banco está fora — o 200 já é a
      // resposta certa: o evento está persistido e será reprocessado.
    }
  }

  return Response.json({ received: true });
}

/**
 * Carimba o desfecho da aplicação no evento já persistido.
 *
 * ## `aplicado_em` e `erro_aplicacao` juntos é estado LEGÍTIMO (#289, item 3)
 *
 * As duas colunas respondem perguntas diferentes, e não são um par
 * sucesso/erro:
 *
 * - **`aplicado_em` preenchido = "não voltar a processar".** É o único critério
 *   de `reprocessarEventosPendentes`, que varre por `aplicado_em IS NULL`. Ele
 *   diz que o evento chegou ao fim do seu ciclo de vida, não que deu certo.
 * - **`erro_aplicacao` é o DIAGNÓSTICO do desfecho.** Descreve o que aconteceu,
 *   inclusive quando o desfecho é esperado e definitivo (cobrança de ativação
 *   sem ciclo, evento de outra aplicação, evento sem id utilizável).
 *
 * Por isso a combinação "carimbado E com motivo" é a forma normal de registrar
 * um evento que não tem mais nada a fazer mas também não aplicou efeito nenhum
 * — e é justamente o que impede a fila de crescer para sempre com eventos que
 * nunca vão conciliar. As outras combinações também são válidas:
 * `aplicado_em NULL` + motivo = falha transitória, volta na varredura;
 * `aplicado_em` + `NULL` = aplicou limpo.
 *
 * Consequência para quem consulta: "deu errado" NÃO é `erro_aplicacao IS NOT
 * NULL` — e também não é igualdade com o motivo de alarme. O que fica aqui é um
 * carimbo HISTÓRICO, verdade do instante da gravação e nunca reavaliado: a
 * corrida em que o evento chega antes de `billing_cycle.provider_charge_id`
 * persistir deixaria um alarme falso gravado para sempre, e a falha por exceção
 * grava a mensagem do erro em vez do motivo classificado. Por isso a consulta
 * operacional reavalia o estado vivo do ciclo e não lê esta coluna — ver
 * `listarCobrancasDeCicloNaoConciliadas`.
 *
 * A mesma nota está no docblock de `src/lib/billing/erro-aplicacao.ts`, e NÃO
 * no comentário da tabela em `schema.ts`: o guard
 * `src/db/migrations-vs-main.test.ts` exige snapshot novo de Drizzle para
 * qualquer diff em `schema.ts`, comentário incluso, e esta entrega não tem
 * migração.
 */
async function marcar(
  id: string,
  campos: { aplicadoEm?: Date; erroAplicacao?: string | null },
): Promise<void> {
  await authDb
    .update(asaasWebhookEvent)
    .set(campos)
    .where(eq(asaasWebhookEvent.id, id));
}
