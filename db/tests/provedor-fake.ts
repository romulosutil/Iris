import type {
  BillingProvider,
  CobrancaEmitida,
  EntradaVerificacaoWebhook,
  EventoWebhookNormalizado,
  NovaCobrancaDeCiclo,
  NovoVinculo,
  ProviderId,
  StatusAssinaturaProvider,
  StatusCobranca,
  TipoEventoNormalizado,
  VinculoCriado,
} from "@/lib/billing/provider/types";

/**
 * Provedor de pagamento FAKE, para os testes que provam "a linha decide o
 * adapter" (D25/D26/D27) sem depender de um segundo gateway real (T14 de #36).
 *
 * ## Por que ele existe
 *
 * Três invariantes custaram três defeitos seguidos em produção:
 *
 * 1. vínculo pendente de OUTRO gateway nunca é consultado nem reaproveitado (D25);
 * 2. o fechamento de ciclo resolve o adapter POR LINHA, não pela env (D26);
 * 3. a varredura de pendentes casa tabela × adapter, nunca cruzado (#232).
 *
 * Os três testes que fixam isso usavam o Mercado Pago como "o outro gateway".
 * Com a remoção do MP (D24), o segundo gateway deixa de existir no código — e
 * deletar a cobertura junto seria trocar três defeitos provados por um verde
 * vazio. O que sai é o NOME do provedor; o invariante fica, com este fake no
 * lugar do segundo trilho.
 *
 * ## Por que é uma CLASSE de verdade
 *
 * `vi.fn().mockImplementation(() => ({}))` no lugar de uma classe faz `new X()`
 * estourar, o erro cai no `catch` da produção e o teste passa pelo caminho
 * errado — precedente medido em #154. Aqui o dublê é uma classe que implementa
 * `BillingProvider` inteira; o TypeScript derruba o build se a porta ganhar um
 * método e este arquivo não acompanhar.
 *
 * ## Por que ele fala HTTP
 *
 * O oráculo dos três testes é a URL efetivamente chamada, não a coluna final: a
 * coluna certa pode ter sido escrita pelo caminho errado. Um fake que só
 * devolvesse objetos apagaria justamente o sinal que interessa. Então ele chama
 * `fetch` de verdade, contra um host próprio (`BASE_URL_FAKE`), que o dublê de
 * `fetch` do teste intercepta e registra.
 *
 * O dialeto do wire é DELIBERADAMENTE diferente do Asaas (`estado` em vez de
 * `status`, `vinculoId`/`cobrancaId` em vez de `authorization`/`payment`): se
 * fosse igual, "o adapter errado normalizou o payload do outro" passaria por
 * acaso — que é exatamente o modo de falha que a cobertura existe para pegar.
 */

/**
 * Tipado como `string`, não como literal, de propósito: o T15 estreita
 * `ProviderId` para `"asaas"` e um `as ProviderId` a partir de um literal
 * incompatível viraria erro de conversão. O fake não é (nem quer ser) um
 * provedor conhecido — ele é o "outro gateway" que a linha aponta.
 */
export const ID_PROVEDOR_FAKE: string = "gateway_fake";

export const BASE_URL_FAKE = "https://gateway-fake.test/v1";

/** Prefixo do id de cobrança que o fake devolve — reconhecível na asserção. */
const PREFIXO_COBRANCA_FAKE = "cob_fake_";

function mapearStatusVinculo(estado: unknown): StatusAssinaturaProvider {
  switch (estado) {
    case "AUTORIZADO":
      return "autorizada";
    case "PAUSADO":
      return "pausada";
    case "CANCELADO":
      return "cancelada";
    default:
      return "pendente";
  }
}

function mapearStatusCobranca(estado: unknown): StatusCobranca {
  switch (estado) {
    case "LIQUIDADA":
      return "paga";
    case "RECUSADA":
      return "recusada";
    case "ESTORNADA":
      return "estornada";
    default:
      return "pendente";
  }
}

function mapearTipoEvento(tipo: unknown): TipoEventoNormalizado {
  switch (tipo) {
    case "vinculo.autorizado":
      return "assinatura.autorizada";
    case "vinculo.pausado":
      return "assinatura.pausada";
    case "vinculo.cancelado":
      return "assinatura.cancelada";
    case "cobranca.liquidada":
      return "cobranca.paga";
    case "cobranca.recusada":
      return "cobranca.recusada";
    default:
      return "desconhecido";
  }
}

async function pedir(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const resposta = await fetch(url, init);
  if (!resposta.ok) {
    // Espelha a disciplina do adapter real: resposta não-2xx é recusa do
    // gateway (classificável por status), erro de rede sobe cru como
    // transitório. Sem isso, o teste de 4xx×5xx não teria como distinguir.
    const { BillingProviderError } =
      await import("@/lib/billing/provider/types");
    throw new BillingProviderError(
      `Gateway fake respondeu ${resposta.status} em ${url}`,
      { status: resposta.status },
    );
  }
  return (await resposta.json()) as Record<string, unknown>;
}

export class ProvedorFake implements BillingProvider {
  readonly id = ID_PROVEDOR_FAKE as ProviderId;

  async iniciarVinculoPagamento(dados: NovoVinculo): Promise<VinculoCriado> {
    const corpo = await pedir(`${BASE_URL_FAKE}/vinculos`, {
      method: "POST",
      body: JSON.stringify({
        referencia: dados.referenciaExterna,
        documento: dados.assinante.cpfCnpj,
      }),
    });
    return {
      providerVinculoId: String(corpo.id),
      providerCustomerId:
        corpo.assinanteId === undefined ? undefined : String(corpo.assinanteId),
      autorizacao: {
        forma: "pix_copia_e_cola",
        brCode: String(corpo.brCode ?? ""),
        valorAtivacaoCentavos: Number(corpo.valorAtivacaoCentavos ?? 1),
      },
      status: mapearStatusVinculo(corpo.estado),
    };
  }

  async consultarVinculo(
    providerVinculoId: string,
  ): Promise<{ status: StatusAssinaturaProvider }> {
    const corpo = await pedir(`${BASE_URL_FAKE}/vinculos/${providerVinculoId}`);
    return { status: mapearStatusVinculo(corpo.estado) };
  }

  async cancelarVinculo(providerVinculoId: string): Promise<void> {
    await pedir(`${BASE_URL_FAKE}/vinculos/${providerVinculoId}/cancelamento`, {
      method: "POST",
    });
  }

  async emitirCobrancaDeCiclo(
    dados: NovaCobrancaDeCiclo,
  ): Promise<CobrancaEmitida> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas`, {
      method: "POST",
      body: JSON.stringify({
        vinculoId: dados.vinculoId,
        centavos: dados.valorCentavos,
        referencia: dados.referenciaExterna,
      }),
    });
    return {
      providerChargeId: String(corpo.id),
      status: mapearStatusCobranca(corpo.estado),
    };
  }

  async consultarCobranca(
    providerChargeId: string,
  ): Promise<{ status: StatusCobranca; valorCentavos: number }> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas/${providerChargeId}`);
    return {
      status: mapearStatusCobranca(corpo.estado),
      valorCentavos: Number(corpo.centavos ?? 0),
    };
  }

  verificarAssinaturaWebhook(input: EntradaVerificacaoWebhook): boolean {
    // Mesma regra da porta: nunca lança e nunca revela o motivo da recusa.
    return (
      input.cabecalhos.get("x-fake-token") === process.env.FAKE_WEBHOOK_TOKEN
    );
  }

  normalizarEvento(payload: unknown): EventoWebhookNormalizado {
    const p = (payload ?? {}) as Record<string, unknown>;
    return {
      eventId: typeof p.id === "string" ? p.id : "",
      tipo: mapearTipoEvento(p.tipo),
      providerSubscriptionId:
        typeof p.vinculoId === "string" ? p.vinculoId : null,
      providerChargeId: typeof p.cobrancaId === "string" ? p.cobrancaId : null,
      referenciaExterna: typeof p.referencia === "string" ? p.referencia : null,
      ocorridoEm: null,
      bruto: payload,
    };
  }
}
