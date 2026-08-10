import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { mercadopagoWebhookEvent } from "@/db/schema";
import { MercadoPagoProvider } from "@/lib/billing/provider";
import {
  aplicarStatusProvider,
  conciliarPagamentoDeCiclo,
} from "@/lib/billing/subscription";

/**
 * Webhook do Mercado Pago (#36).
 *
 * Espelha `../asaas/route.ts` nas decisões que já foram pagas com incidente:
 * dedup decidida pelo UNIQUE do Postgres em UMA instrução atômica, resposta
 * idêntica para todas as formas de falha de autenticação, 400 para corpo
 * malformado (reentrega não conserta) e 5xx só para falha real de infra.
 *
 * Três diferenças que o Mercado Pago impõe:
 *
 * 1. **Autenticação é HMAC, não token fixo.** O MP assina um manifest que
 *    mistura o `data.id` da query string, o header `x-request-id` e um
 *    timestamp — por isso a verificação precisa da URL inteira, não só do
 *    corpo. Fica no adapter (`verificarAssinaturaWebhook`), não aqui.
 *
 * 2. **O payload não diz o estado.** A notificação costuma ser só
 *    `{type, action, data:{id}}`. Decidir a transição a partir do tipo do
 *    evento seria inventar dado que o gateway não mandou — então o efeito é
 *    aplicado a partir de uma CONSULTA à assinatura, não do payload.
 *
 * 3. **O MP desabilita endpoint lento.** Por isso a gravação e a resposta 200
 *    vêm antes da aplicação do efeito, e uma falha ao aplicar NÃO vira 5xx: o
 *    evento fica com `aplicado_em` NULL e a varredura
 *    `reprocessarEventosPendentes` o recupera. Devolver 5xx aqui trocaria um
 *    efeito atrasado por um webhook desligado.
 *
 * `MercadoPagoProvider` é instanciado aqui, e NÃO resolvido por
 * `getBillingProvider()` — a rota do Asaas já dizia isso de si mesma
 * (`../asaas/route.ts`), esta não espelhava e o defeito ficou vivo até 10/08/2026.
 * Esta rota é a do Mercado Pago: qual gateway está ativo na env não muda quem
 * assinou esta entrega. Com `BILLING_PROVIDER=asaas`, quem verificava o HMAC do
 * MP era o `AsaasProvider` — que procura um token fixo em outro header e devolve
 * `false`. Resultado: **401 em entrega legítima**, indistinguível de ataque
 * (a resposta é opaca de propósito), num endpoint que o MP desabilita quando
 * falha demais.
 */

// node:crypto + driver Postgres: precisa de runtime Node, não edge.
export const runtime = "nodejs";
// Sem cache: é webhook, cada POST é efeito colateral.
export const dynamic = "force-dynamic";

/**
 * Chave de deduplicação. O MP não manda um id de EVENTO estável em todo
 * formato de notificação, então a chave é composta: tipo + id do recurso +
 * ação. Duas entregas da mesma notificação produzem a mesma string; uma
 * mudança de estado posterior do mesmo recurso produz outra (`action` muda),
 * e portanto não é engolida como duplicata.
 */
function chaveDedup(p: Record<string, unknown>): string | null {
  const data = (p.data ?? {}) as Record<string, unknown>;
  const recurso = textoOuNulo(data.id) ?? textoOuNulo(p.id);
  if (!recurso) return null;
  const tipo = textoOuNulo(p.type) ?? textoOuNulo(p.topic) ?? "desconhecido";
  const acao = textoOuNulo(p.action) ?? "-";
  return `${tipo}:${recurso}:${acao}`;
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // Lido como texto porque o HMAC é sobre bytes: `await request.json()` seguido
  // de re-serialização mudaria o corpo e invalidaria assinatura válida.
  let corpoBruto: string;
  try {
    corpoBruto = await request.text();
  } catch {
    return Response.json({ error: "corpo ilegível" }, { status: 400 });
  }

  const provider = new MercadoPagoProvider();

  if (
    !provider.verificarAssinaturaWebhook({
      corpoBruto,
      cabecalhos: request.headers,
      url: request.url,
    })
  ) {
    // Corpo curto e IDÊNTICO para assinatura errada, header ausente e segredo
    // não configurado: a resposta não pode dizer qual dos três aconteceu.
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return Response.json(
      { error: "corpo inválido (JSON esperado)" },
      { status: 400 },
    );
  }

  const p = (payload ?? {}) as Record<string, unknown>;

  /**
   * O HMAC do Mercado Pago assina um manifest — `id;request-id;ts` — e **não
   * cobre o corpo**. Sem esta checagem, uma assinatura válida capturada valeria,
   * dentro da janela de 5 minutos, para QUALQUER corpo: bastaria trocar
   * `data.id` no JSON para apontar o efeito a outra assinatura, de outra
   * clínica, reusando a assinatura legítima.
   *
   * O amarrador é exigir que o `data.id` do corpo seja o mesmo que foi de fato
   * assinado (o da query string). Quem controla o corpo passa a precisar
   * também de um manifest assinado para aquele id específico.
   */
  const idAssinado = new URL(request.url).searchParams.get("data.id");
  const idNoCorpo = textoOuNulo(
    ((p.data ?? {}) as Record<string, unknown>).id ?? p.id,
  );
  if (idAssinado && idNoCorpo && idAssinado !== idNoCorpo) {
    // Mesmo corpo e mesmo status das demais recusas de autenticação: a resposta
    // não pode distinguir "assinatura errada" de "corpo adulterado".
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  const providerEventId = chaveDedup(p);
  const evento =
    textoOuNulo(p.type) ?? textoOuNulo(p.topic) ?? textoOuNulo(p.action);

  if (!providerEventId || !evento) {
    // Sem chave não há dedup, e gravar sem chave é pior que recusar: o MP
    // reentrega e nós duplicaríamos efeito de faturamento.
    return Response.json(
      { error: "payload sem identificador de recurso ou tipo" },
      { status: 400 },
    );
  }

  let eventoId: string;
  try {
    const inseridas = await authDb
      .insert(mercadopagoWebhookEvent)
      .values({ providerEventId, evento, payload })
      .onConflictDoNothing({ target: mercadopagoWebhookEvent.providerEventId })
      .returning({ id: mercadopagoWebhookEvent.id });

    if (inseridas.length === 0) {
      return Response.json({ received: true, duplicado: true });
    }
    eventoId = inseridas[0]!.id;
  } catch (err) {
    // Falha real de infraestrutura (banco fora) DEVE ser 5xx: aí a reentrega
    // do Mercado Pago é justamente o comportamento desejado.
    console.error("[mercadopago-webhook] falha ao registrar evento", {
      providerEventId,
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
    // `cycle:<id>` e é o ÚNICO caminho pelo qual um ciclo vira `pago`. Sem
    // isto, um evento de pagamento seria tratado como evento de assinatura e a
    // fatura ficaria eternamente em `aguardando_pagamento`.
    if (normalizado.providerChargeId) {
      const atual = await provider.consultarCobranca(
        normalizado.providerChargeId,
      );
      const aplicou = await conciliarPagamentoDeCiclo(
        normalizado.providerChargeId,
        atual.status,
      );
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({
          aplicadoEm: new Date(),
          erroAplicacao: aplicou ? null : "cobrança sem ciclo correspondente",
        })
        .where(eqId(eventoId));
    } else if (normalizado.providerSubscriptionId) {
      const atual = await provider.consultarVinculo(
        normalizado.providerSubscriptionId,
      );
      const aplicou = await aplicarStatusProvider(
        normalizado.providerSubscriptionId,
        atual.status,
      );
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({
          aplicadoEm: new Date(),
          // Vínculo desconhecido não é erro de infra: pode ser evento de outra
          // aplicação apontada para o mesmo endpoint. Fica registrado como
          // motivo, sem repetir a consulta para sempre.
          erroAplicacao: aplicou ? null : "assinatura desconhecida",
        })
        .where(eqId(eventoId));
    } else {
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({
          aplicadoEm: new Date(),
          erroAplicacao: "evento sem id utilizável",
        })
        .where(eqId(eventoId));
    }
  } catch (err) {
    // Efeito não aplicado, entrega preservada: `aplicado_em` continua NULL e a
    // varredura de pendentes tenta de novo. Registrar o erro e responder 200.
    console.error("[mercadopago-webhook] falha ao aplicar efeito", {
      providerEventId,
      err,
    });
    try {
      await authDb
        .update(mercadopagoWebhookEvent)
        .set({
          erroAplicacao: err instanceof Error ? err.message : String(err),
        })
        .where(eqId(eventoId));
    } catch {
      // Se nem o registro do erro grava, o banco está fora — o 200 já é a
      // resposta certa: o evento está persistido e será reprocessado.
    }
  }

  return Response.json({ received: true });
}

function eqId(id: string) {
  return eq(mercadopagoWebhookEvent.id, id);
}
