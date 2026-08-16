import type {
  BillingProvider,
  CobrancaEmitida,
  CobrancaParaReuso,
  EntradaVerificacaoWebhook,
  EventoWebhookNormalizado,
  NovaCobrancaAvulsa,
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

  /**
   * Cobrança avulsa contra o cliente (#290 — débito de reativação).
   *
   * O fake usa o MESMO endpoint de cobrança, com `vinculoId` no lugar do
   * cliente: o que o teste precisa observar é a cobrança existindo e sendo
   * conciliável, não a diferença de trilho — essa distinção é do adapter real
   * (Pix comum × débito da autorização revogada) e é lá que ela é testada.
   */
  async emitirCobrancaAvulsa(
    dados: NovaCobrancaAvulsa,
  ): Promise<CobrancaEmitida> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas`, {
      method: "POST",
      body: JSON.stringify({
        vinculoId: dados.clienteId,
        centavos: dados.valorCentavos,
        referencia: dados.referenciaExterna,
      }),
    });
    return {
      providerChargeId: String(corpo.id),
      status: mapearStatusCobranca(corpo.estado),
      pixCopiaECola: `00020126-fake-debito-${corpo.id}`,
    };
  }

  async consultarCobranca(providerChargeId: string): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    motivoRecusa: string | null;
  }> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas/${providerChargeId}`);
    return {
      status: mapearStatusCobranca(corpo.estado),
      valorCentavos: Number(corpo.centavos ?? 0),
      // Gateway fake não modela motivo de recusa; mesmo caminho "não informado"
      // do adapter real do Asaas.
      motivoRecusa: null,
    };
  }

  /**
   * Reuso de cobrança (#310). O `estado` do wire decide, e o copia-e-cola é
   * derivado do id, igual ao de `emitirCobrancaAvulsa`.
   *
   * ## Todos os desfechos são expressáveis, e por qual opção
   *
   * A versão anterior devolvia `pagavel` para tudo que não fosse paga ou
   * estornada: nenhum teste que usa o fake conseguia produzir
   * `em_processamento`, `removida` ou `status_nao_pagavel`, e os ramos novos do
   * chamador ficavam sem exercício nenhum. Agora cada desfecho tem uma opção de
   * construção, no idioma que este arquivo já usa — o corpo do wire:
   *
   * | Corpo devolvido pelo `fetch` do teste | Desfecho             |
   * | ------------------------------------- | -------------------- |
   * | `{ estado: "LIQUIDADA" }`             | `paga`               |
   * | `{ estado: "ESTORNADA" }`             | `morta/estornada`    |
   * | `{ removida: true }`                  | `morta/removida`     |
   * | `{ estado: "EM_DEBITO" }`             | `em_processamento`   |
   * | `{ estado: "PENDENTE" \| "VENCIDA", centavos }` | `pagavel`   |
   * | `{ estado: "PENDENTE" }` (sem `centavos` legível) | `morta/valor_indeterminado` |
   * | qualquer outro `estado`               | `morta/status_nao_pagavel` |
   *
   * A opção é o corpo do wire, e não um parâmetro de construtor, porque o
   * oráculo deste dublê é a URL efetivamente chamada (ver docstring do topo):
   * uma resposta enlatada no construtor faria o teste passar sem que o
   * chamador lesse coisa alguma do gateway.
   *
   * **Allow-list, igual ao adapter real**: estado desconhecido cai em
   * não-pagável. Uma deny-list aqui deixaria o dublê mais permissivo que a
   * produção, que é a pior direção possível para um dublê.
   */
  async consultarCobrancaParaReuso(
    providerChargeId: string,
  ): Promise<CobrancaParaReuso> {
    const corpo = await pedir(`${BASE_URL_FAKE}/cobrancas/${providerChargeId}`);

    // Checado antes do estado: uma cobrança removida continua carregando o
    // estado que tinha na remoção (mesma armadilha do `deleted` do Asaas).
    if (corpo.removida === true) return { reuso: "morta", motivo: "removida" };

    const status = mapearStatusCobranca(corpo.estado);
    if (status === "paga") return { reuso: "paga" };
    if (status === "estornada") return { reuso: "morta", motivo: "estornada" };
    // Débito automático a caminho: não apresentar forma de pagamento nenhuma.
    if (corpo.estado === "EM_DEBITO") return { reuso: "em_processamento" };
    if (corpo.estado !== "PENDENTE" && corpo.estado !== "VENCIDA") {
      return { reuso: "morta", motivo: "status_nao_pagavel" };
    }

    /**
     * Valor ausente ou ilegível é `morta/valor_indeterminado`, igual ao adapter
     * real — e NÃO `pagavel` de R$ 0,00.
     *
     * O `Number(corpo.centavos ?? 0)` de antes deixava o dublê mais permissivo
     * que a produção, que é a pior direção possível: o `AsaasProvider` recusa
     * a cobrança sem `value` numérico ("apresentar um copia-e-cola ao lado de
     * R$ 0,00 é a mesma mentira do QR vazio"), e o chamador só tem esse ramo
     * porque ele existe lá. Com o dublê frouxo, o ramo nunca era exercitado e
     * o `NaN` de um `"20,00"` chegaria à tela.
     */
    const valorCentavos = corpo.centavos;
    if (typeof valorCentavos !== "number" || !Number.isFinite(valorCentavos)) {
      return { reuso: "morta", motivo: "valor_indeterminado" };
    }

    return {
      reuso: "pagavel",
      // Vem do wire pelo mesmo campo de `consultarCobranca`: o valor de uma
      // cobrança reaproveitada é o dela, nunca o que o chamador supõe.
      valorCentavos,
      pagamento: {
        forma: "pix_copia_e_cola",
        brCode: `00020126-fake-debito-${providerChargeId}`,
      },
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
      // O gateway fake não modela instrução de débito separada da cobrança —
      // essa entidade é do Pix Automático. `null` é o caminho "não há instrução
      // para consultar", que a porta exige que exista.
      providerInstructionId: null,
      referenciaExterna: typeof p.referencia === "string" ? p.referencia : null,
      ocorridoEm: null,
      bruto: payload,
    };
  }
}
