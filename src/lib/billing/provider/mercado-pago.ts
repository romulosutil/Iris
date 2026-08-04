import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  type AssinaturaCriada,
  type BillingProvider,
  type EntradaVerificacaoWebhook,
  type EventoWebhookNormalizado,
  type NovaAssinatura,
  type StatusAssinaturaProvider,
  type TipoEventoNormalizado,
} from "./types";

/**
 * Adapter do Mercado Pago sobre a porta `BillingProvider`.
 *
 * ## Por que `fetch` nativo e não o SDK `mercadopago`
 *
 * O repo já tomou esse prejuízo: o Dockerfile do job de escalonamento lista os
 * `COPY` e instala dependências à mão, e um pacote adicionado no `package.json`
 * da raiz simplesmente **não chegou na imagem** — o motor caiu em produção com
 * `test`/`typecheck`/`lint` todos verdes (#156/#157). São quatro chamadas HTTP;
 * `fetch` nativo do Node 22 não tem esse risco de entrega.
 *
 * ## Env — lidas por função, nunca no escopo do módulo
 *
 * Ler `process.env` no topo congela o valor no momento em que o módulo é
 * avaliado: quebra o build (a var não existe em build-time) e impede
 * `vi.stubEnv` no teste. Toda leitura acontece dentro da função que precisa.
 *
 *   MERCADOPAGO_ACCESS_TOKEN   token de acesso (Bearer) — secret
 *   MERCADOPAGO_WEBHOOK_SECRET segredo da assinatura de webhook — secret
 *   MERCADOPAGO_BASE_URL       opcional; default https://api.mercadopago.com
 *
 * ## Dinheiro
 *
 * A fonte da verdade interna do Iris é **inteiro em centavos**. O Mercado Pago
 * exige `transaction_amount` decimal em reais, então a conversão acontece só na
 * borda, em `centavosParaReais()`. Nada fora deste arquivo enxerga o decimal.
 */

/** Timeout de rede. Sem ele, um gateway pendurado prende o request inteiro. */
const TIMEOUT_MS = 10_000;

/** Janela de tolerância do timestamp assinado, contra replay. */
const JANELA_REPLAY_MS = 5 * 60 * 1000;

const BASE_URL_PADRAO = "https://api.mercadopago.com";

function baseUrl(): string {
  return process.env.MERCADOPAGO_BASE_URL || BASE_URL_PADRAO;
}

function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new BillingProviderError(
      "MERCADOPAGO_ACCESS_TOKEN não configurado",
    );
  }
  return token;
}

/**
 * Centavos (inteiro, fonte da verdade) → reais decimal com 2 casas.
 *
 * `valorCentavos / 100` sozinho produz binário sujo (3900/100 é exato, mas
 * 1999/100 = 19.990000000000002 em outras contas encadeadas). Arredondar via
 * `Number(x.toFixed(2))` é determinístico para qualquer valor que caiba em
 * centavos e não depende de locale — `toLocaleString` dependeria.
 */
function centavosParaReais(valorCentavos: number): number {
  return Number((valorCentavos / 100).toFixed(2));
}

/** Reais decimal → centavos inteiros, para a volta (consulta). */
function reaisParaCentavos(valorReais: number): number {
  return Math.round(valorReais * 100);
}

/** Status do MP → vocabulário do Iris. Desconhecido cai em `pendente`. */
function mapearStatus(status: unknown): StatusAssinaturaProvider {
  switch (status) {
    case "authorized":
      return "autorizada";
    case "paused":
      return "pausada";
    case "cancelled":
      return "cancelada";
    case "pending":
      return "pendente";
    default:
      // Estado novo do gateway não pode virar exceção no meio de um webhook:
      // "pendente" é o único default seguro (não libera nada, não cancela nada).
      return "pendente";
  }
}

/**
 * Chamada HTTP à API do MP.
 *
 * Não-2xx vira `BillingProviderError` com `status` e corpo preservado (texto ou
 * JSON, o que der para ler) — sem isso o chamador não distingue "cartão
 * recusado" de "token errado". Erro de rede/timeout **não** é embrulhado: sobe
 * como veio, porque é transitório e a decisão de retry é diferente.
 */
async function chamar(
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  opcoes?: { corpo?: unknown; idempotencyKey?: string },
): Promise<unknown> {
  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${accessToken()}`,
    Accept: "application/json",
  };
  if (opcoes?.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
  }
  if (opcoes?.idempotencyKey) {
    cabecalhos["X-Idempotency-Key"] = opcoes.idempotencyKey;
  }

  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: opcoes?.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const texto = await resposta.text();
  let corpo: unknown = texto;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      // Mantém o texto cru: HTML de erro de proxy também é diagnóstico útil.
    }
  }

  if (!resposta.ok) {
    throw new BillingProviderError(
      `Mercado Pago respondeu ${resposta.status} em ${metodo} ${caminho}`,
      { status: resposta.status, corpo },
    );
  }

  return corpo;
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object"
    ? (valor as Record<string, unknown>)
    : {};
}

function comoTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

/**
 * Verificação da assinatura `x-signature` do Mercado Pago.
 *
 * Formato do header: `ts=<timestamp>,v1=<hex sha256>`.
 * Manifest assinado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * onde `data.id` vem do **query param** `data.id` da URL de notificação — por
 * isso a porta passa `url` junto do corpo.
 *
 * Cuidados herdados de `src/app/api/hooks/asaas/route.ts`:
 * 1. `timingSafeEqual` LANÇA com buffers de tamanhos diferentes → compara-se o
 *    tamanho antes e devolve `false` (o tamanho do hash não é segredo).
 * 2. Segredo ausente → `false`, nunca "passa porque não há segredo". Deploy sem
 *    o secret rejeita tudo, não aceita tudo.
 * 3. Nada aqui lança: header ausente, malformado, hex inválido, tudo é `false`.
 *
 * Além disso, timestamp fora da janela de 5 min é recusado — assinatura válida
 * capturada ontem não pode ser reenviada hoje.
 */
function verificarAssinaturaWebhookMP(
  input: EntradaVerificacaoWebhook,
): boolean {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!segredo) return false;

  const header = input.cabecalhos.get("x-signature");
  if (!header) return false;

  let ts: string | null = null;
  let v1: string | null = null;
  for (const parte of header.split(",")) {
    const idx = parte.indexOf("=");
    if (idx <= 0) continue;
    const chave = parte.slice(0, idx).trim();
    const valor = parte.slice(idx + 1).trim();
    if (chave === "ts") ts = valor;
    else if (chave === "v1") v1 = valor;
  }
  if (!ts || !v1) return false;

  // Replay: `ts` do MP vem em milissegundos.
  const tsNumero = Number(ts);
  if (!Number.isFinite(tsNumero)) return false;
  if (Math.abs(Date.now() - tsNumero) > JANELA_REPLAY_MS) return false;

  let dataId: string;
  try {
    dataId = new URL(input.url).searchParams.get("data.id") ?? "";
  } catch {
    // URL malformada é recusa, não exceção.
    return false;
  }
  const requestId = input.cabecalhos.get("x-request-id") ?? "";

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = createHmac("sha256", segredo).update(manifest).digest("hex");

  const a = Buffer.from(v1, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `{ type, action, data: { id } }` do MP → evento normalizado.
 *
 * O MP tem duas convenções convivendo (`type: "preapproval"` e
 * `type: "subscription_preapproval"`), e a granularidade real está em `action`
 * (`payment.created` vs `payment.updated` não dizem nada; o status do pagamento
 * é que diz). Cobrimos o que sabemos e mandamos o resto para `desconhecido` —
 * **nunca lança**: o handler de webhook precisa responder 200 mesmo para evento
 * que não entende, senão o MP entra em loop de reentrega.
 */
function normalizarEventoMP(payload: unknown): EventoWebhookNormalizado {
  const p = comoRegistro(payload);
  const data = comoRegistro(p.data);
  const tipoMP = comoTexto(p.type);
  const action = comoTexto(p.action) ?? "";
  const acaoCurta = action.includes(".") ? action.split(".").pop()! : action;

  let tipo: TipoEventoNormalizado = "desconhecido";

  if (tipoMP === "preapproval" || tipoMP === "subscription_preapproval") {
    // O estado pode chegar em `status` (raiz) ou em `data.status`.
    const status = comoTexto(p.status) ?? comoTexto(data.status) ?? acaoCurta;
    switch (status) {
      case "authorized":
        tipo = "assinatura.autorizada";
        break;
      case "paused":
        tipo = "assinatura.pausada";
        break;
      case "cancelled":
        tipo = "assinatura.cancelada";
        break;
      default:
        tipo = "desconhecido";
    }
  } else if (tipoMP === "payment") {
    const status = comoTexto(p.status) ?? comoTexto(data.status) ?? "";
    if (status === "approved") tipo = "pagamento.aprovado";
    else if (status === "rejected" || status === "cancelled")
      tipo = "pagamento.recusado";
    else tipo = "desconhecido";
  }

  const ocorridoTexto =
    comoTexto(p.date_created) ?? comoTexto((p as { dateCreated?: unknown }).dateCreated);
  let ocorridoEm: Date | null = null;
  if (ocorridoTexto) {
    const d = new Date(ocorridoTexto);
    ocorridoEm = Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * `data.id` só é id de assinatura quando o evento É de assinatura. Numa
   * notificação `type: "payment"`, `data.id` é o id do PAGAMENTO — devolvê-lo
   * aqui faria o consumidor pedir `GET /preapproval/<payment_id>`, tomar 404 e
   * deixar o evento pendente para sempre na varredura de reprocessamento.
   * O vínculo do pagamento com a assinatura vem de `preapproval_id`, quando o
   * MP o inclui; sem ele, não há id de assinatura a reportar.
   */
  const idAssinatura =
    tipoMP === "payment"
      ? (comoTexto((p as { preapproval_id?: unknown }).preapproval_id) ??
        comoTexto((data as { preapproval_id?: unknown }).preapproval_id))
      : (comoTexto(data.id) ??
        comoTexto((p as { preapproval_id?: unknown }).preapproval_id));

  return {
    eventId: comoTexto(p.id) ?? comoTexto(data.id) ?? "",
    tipo,
    providerSubscriptionId: idAssinatura,
    referenciaExterna: comoTexto(p.external_reference) ?? comoTexto(data.external_reference),
    ocorridoEm,
    bruto: payload,
  };
}

/** Implementação da porta. Sem estado: pode ser instanciada a cada chamada. */
export class MercadoPagoProvider implements BillingProvider {
  readonly id = "mercado_pago" as const;

  async criarAssinatura(dados: NovaAssinatura): Promise<AssinaturaCriada> {
    const resposta = comoRegistro(
      await chamar("POST", "/preapproval", {
        idempotencyKey: dados.referenciaExterna,
        corpo: {
          reason: `Iris — ${dados.assinante.nomeClinica}`,
          external_reference: dados.referenciaExterna,
          payer_email: dados.assinante.emailResponsavel,
          back_url: dados.urlRetorno,
          status: "pending",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: centavosParaReais(dados.valorCentavos),
            currency_id: "BRL",
          },
        },
      }),
    );

    const providerSubscriptionId = comoTexto(resposta.id);
    const checkoutUrl = comoTexto(resposta.init_point);
    if (!providerSubscriptionId || !checkoutUrl) {
      // 2xx sem `id`/`init_point` é contrato quebrado: falhar alto é melhor que
      // persistir assinatura sem identificador (ficaria órfã e invisível).
      throw new BillingProviderError(
        "resposta do Mercado Pago sem `id` ou `init_point`",
        { corpo: resposta },
      );
    }

    return {
      providerSubscriptionId,
      checkoutUrl,
      status: mapearStatus(resposta.status),
    };
  }

  async atualizarValorRecorrente(
    providerSubscriptionId: string,
    valorCentavos: number,
  ): Promise<void> {
    await chamar("PUT", `/preapproval/${providerSubscriptionId}`, {
      corpo: {
        auto_recurring: {
          transaction_amount: centavosParaReais(valorCentavos),
          currency_id: "BRL",
        },
      },
    });
  }

  async consultarAssinatura(providerSubscriptionId: string): Promise<{
    status: StatusAssinaturaProvider;
    valorCentavos: number;
  }> {
    const resposta = comoRegistro(
      await chamar("GET", `/preapproval/${providerSubscriptionId}`),
    );
    const recorrencia = comoRegistro(resposta.auto_recurring);
    const valor = recorrencia.transaction_amount;

    return {
      status: mapearStatus(resposta.status),
      valorCentavos:
        typeof valor === "number" && Number.isFinite(valor)
          ? reaisParaCentavos(valor)
          : 0,
    };
  }

  async cancelarAssinatura(providerSubscriptionId: string): Promise<void> {
    await chamar("PUT", `/preapproval/${providerSubscriptionId}`, {
      corpo: { status: "cancelled" },
    });
  }

  verificarAssinaturaWebhook(input: EntradaVerificacaoWebhook): boolean {
    return verificarAssinaturaWebhookMP(input);
  }

  normalizarEvento(payload: unknown): EventoWebhookNormalizado {
    return normalizarEventoMP(payload);
  }
}
