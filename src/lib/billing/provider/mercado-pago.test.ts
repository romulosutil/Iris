import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoProvider } from "./mercado-pago";
import { getBillingProvider } from "./index";
import { BillingProviderError } from "./types";

/**
 * Testes unitários puros do adapter Mercado Pago — sem rede, sem banco.
 *
 * Disciplina deliberada em dois pontos:
 *
 * 1. **O manifest da assinatura é escrito literalmente aqui**, não importado do
 *    módulo sob teste. Se o teste montasse o manifest chamando o próprio código
 *    testado, uma mudança errada no manifest passaria verde — o teste seguiria o
 *    bug. Escrito à mão, ele falha exatamente quando o formato assinado muda.
 * 2. **Os valores de dinheiro são literais** (3900 centavos → 39). Importar do
 *    calculator acoplaria o teste do adapter à regra de preço.
 */

const SEGREDO = "segredo-de-teste-mp";
const TOKEN = "TEST-access-token";

function respostaOk(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  } as unknown as Response;
}

/** Última chamada feita ao fetch dublê, já com o body desserializado. */
function ultimaChamada(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    metodo: init.method,
    cabecalhos: init.headers as Record<string, string>,
    corpo: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe("MercadoPagoProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", TOKEN);
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SEGREDO);
    vi.stubEnv("MERCADOPAGO_BASE_URL", "https://api.mercadopago.test");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("criarAssinatura", () => {
    it("monta o body do /preapproval e devolve id + init_point", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({
          id: "2c938084",
          init_point: "https://mp.test/checkout/2c938084",
          status: "pending",
        }),
      );

      const resultado = await new MercadoPagoProvider().criarAssinatura({
        assinante: {
          clinicId: "clinic-1",
          nomeClinica: "Clínica Aurora",
          emailResponsavel: "responsavel@aurora.test",
        },
        valorCentavos: 3900,
        metodo: "cartao",
        urlRetorno: "https://iris.test/billing/retorno",
        referenciaExterna: "sub_clinic-1",
      });

      const chamada = ultimaChamada(fetchMock);
      expect(chamada.url).toBe("https://api.mercadopago.test/preapproval");
      expect(chamada.metodo).toBe("POST");
      expect(chamada.cabecalhos.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(chamada.cabecalhos["X-Idempotency-Key"]).toBe("sub_clinic-1");
      expect(chamada.corpo.external_reference).toBe("sub_clinic-1");
      expect(chamada.corpo.payer_email).toBe("responsavel@aurora.test");
      expect(chamada.corpo.back_url).toBe("https://iris.test/billing/retorno");
      expect(chamada.corpo.status).toBe("pending");
      expect(chamada.corpo.auto_recurring).toEqual({
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 39,
        currency_id: "BRL",
      });

      expect(resultado).toEqual({
        providerSubscriptionId: "2c938084",
        checkoutUrl: "https://mp.test/checkout/2c938084",
        status: "pendente",
      });
    });

    it("converte centavos quebrados sem sujeira de ponto flutuante", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({ id: "x", init_point: "https://mp.test/x", status: "pending" }),
      );

      await new MercadoPagoProvider().criarAssinatura({
        assinante: {
          clinicId: "c",
          nomeClinica: "C",
          emailResponsavel: "e@t.test",
        },
        valorCentavos: 1999,
        metodo: "pix",
        urlRetorno: "https://iris.test/r",
        referenciaExterna: "ref",
      });

      expect(
        ultimaChamada(fetchMock).corpo.auto_recurring.transaction_amount,
      ).toBe(19.99);
    });

    it("HTTP 400 vira BillingProviderError com status e corpo preservados", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({ message: "invalid payer_email", error: "bad_request" }, 400),
      );

      const promessa = new MercadoPagoProvider().criarAssinatura({
        assinante: { clinicId: "c", nomeClinica: "C", emailResponsavel: "x" },
        valorCentavos: 3900,
        metodo: "cartao",
        urlRetorno: "https://iris.test/r",
        referenciaExterna: "ref",
      });

      const erro = await promessa.then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro).toBeInstanceOf(BillingProviderError);
      const falha = erro as BillingProviderError;
      expect(falha.status).toBe(400);
      expect(falha.corpo).toEqual({
        message: "invalid payer_email",
        error: "bad_request",
      });
    });
  });

  it("atualizarValorRecorrente faz PUT com o valor novo", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "abc", status: "authorized" }));

    await new MercadoPagoProvider().atualizarValorRecorrente("abc", 7800);

    const chamada = ultimaChamada(fetchMock);
    expect(chamada.metodo).toBe("PUT");
    expect(chamada.url).toBe("https://api.mercadopago.test/preapproval/abc");
    expect(chamada.corpo).toEqual({
      auto_recurring: { transaction_amount: 78, currency_id: "BRL" },
    });
  });

  it("cancelarAssinatura faz PUT com status cancelled", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "abc", status: "cancelled" }));

    await new MercadoPagoProvider().cancelarAssinatura("abc");

    const chamada = ultimaChamada(fetchMock);
    expect(chamada.metodo).toBe("PUT");
    expect(chamada.corpo).toEqual({ status: "cancelled" });
  });

  describe("consultarAssinatura — mapeamento dos 4 status", () => {
    const casos = [
      ["pending", "pendente"],
      ["authorized", "autorizada"],
      ["paused", "pausada"],
      ["cancelled", "cancelada"],
    ] as const;

    it.each(casos)("%s → %s", async (statusMP, esperado) => {
      fetchMock.mockResolvedValue(
        respostaOk({
          id: "abc",
          status: statusMP,
          auto_recurring: { transaction_amount: 39, currency_id: "BRL" },
        }),
      );

      const resultado = await new MercadoPagoProvider().consultarAssinatura("abc");
      expect(resultado.status).toBe(esperado);
      // Volta a decimal → centavos: a fonte da verdade interna é o inteiro.
      expect(resultado.valorCentavos).toBe(3900);
    });
  });

  describe("verificarAssinaturaWebhook", () => {
    const DATA_ID = "123456789";
    const REQUEST_ID = "req-abc-1";
    const AGORA = 1_800_000_000_000;
    const URL_NOTIF = `https://iris.test/api/hooks/mercadopago?data.id=${DATA_ID}&type=payment`;

    function assinar(ts: number, segredo = SEGREDO): string {
      // Manifest escrito LITERALMENTE aqui — ver nota no topo do arquivo.
      const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`;
      return createHmac("sha256", segredo).update(manifest).digest("hex");
    }

    function headers(assinatura: string | null): Headers {
      const h = new Headers({ "x-request-id": REQUEST_ID });
      if (assinatura !== null) h.set("x-signature", assinatura);
      return h;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(AGORA);
    });

    it("assinatura válida => true", () => {
      const ok = new MercadoPagoProvider().verificarAssinaturaWebhook({
        corpoBruto: "{}",
        url: URL_NOTIF,
        cabecalhos: headers(`ts=${AGORA},v1=${assinar(AGORA)}`),
      });
      expect(ok).toBe(true);
    });

    it("assinatura inválida (segredo errado) => false", () => {
      const ok = new MercadoPagoProvider().verificarAssinaturaWebhook({
        corpoBruto: "{}",
        url: URL_NOTIF,
        cabecalhos: headers(`ts=${AGORA},v1=${assinar(AGORA, "outro-segredo")}`),
      });
      expect(ok).toBe(false);
    });

    it("hash de tamanho diferente => false, sem lançar", () => {
      // timingSafeEqual LANÇA com buffers de tamanhos diferentes; a checagem de
      // tamanho antes é o que evita 500 (e loop de reentrega do MP).
      expect(() =>
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          cabecalhos: headers(`ts=${AGORA},v1=abc`),
        }),
      ).not.toThrow();
      expect(
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          cabecalhos: headers(`ts=${AGORA},v1=abc`),
        }),
      ).toBe(false);
    });

    it("header ausente => false", () => {
      expect(
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          cabecalhos: headers(null),
        }),
      ).toBe(false);
    });

    it("header malformado (sem v1) => false", () => {
      expect(
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          cabecalhos: headers(`ts=${AGORA}`),
        }),
      ).toBe(false);
    });

    it("segredo ausente => false (deploy sem secret rejeita tudo)", () => {
      const assinatura = `ts=${AGORA},v1=${assinar(AGORA)}`;
      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
      expect(
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          cabecalhos: headers(assinatura),
        }),
      ).toBe(false);
    });

    it("timestamp com mais de 5 min de desvio => false (replay)", () => {
      const velho = AGORA - 6 * 60 * 1000;
      expect(
        new MercadoPagoProvider().verificarAssinaturaWebhook({
          corpoBruto: "{}",
          url: URL_NOTIF,
          // Assinatura é matematicamente VÁLIDA para esse ts — só é velha.
          cabecalhos: headers(`ts=${velho},v1=${assinar(velho)}`),
        }),
      ).toBe(false);
    });
  });

  describe("normalizarEvento", () => {
    const provider = new MercadoPagoProvider();

    it("preapproval authorized => assinatura.autorizada", () => {
      const evento = provider.normalizarEvento({
        id: "evt-1",
        type: "preapproval",
        action: "updated",
        status: "authorized",
        external_reference: "sub_clinic-1",
        date_created: "2026-08-03T12:00:00Z",
        data: { id: "2c938084" },
      });

      expect(evento.tipo).toBe("assinatura.autorizada");
      expect(evento.eventId).toBe("evt-1");
      expect(evento.providerSubscriptionId).toBe("2c938084");
      expect(evento.referenciaExterna).toBe("sub_clinic-1");
      expect(evento.ocorridoEm?.toISOString()).toBe("2026-08-03T12:00:00.000Z");
    });

    it("preapproval cancelled/paused => tipos correspondentes", () => {
      expect(
        provider.normalizarEvento({
          id: "e",
          type: "subscription_preapproval",
          data: { id: "s", status: "cancelled" },
        }).tipo,
      ).toBe("assinatura.cancelada");

      expect(
        provider.normalizarEvento({ id: "e", type: "preapproval", status: "paused" })
          .tipo,
      ).toBe("assinatura.pausada");
    });

    it("payment approved => pagamento.aprovado", () => {
      expect(
        provider.normalizarEvento({
          id: "evt-2",
          type: "payment",
          action: "payment.updated",
          status: "approved",
          data: { id: "pay-1" },
        }).tipo,
      ).toBe("pagamento.aprovado");
    });

    it("payment rejected => pagamento.recusado", () => {
      expect(
        provider.normalizarEvento({
          id: "evt-3",
          type: "payment",
          status: "rejected",
          data: { id: "pay-2" },
        }).tipo,
      ).toBe("pagamento.recusado");
    });

    /**
     * `data.id` de um evento `type: "payment"` é o id do PAGAMENTO, não da
     * assinatura. Devolvê-lo como `providerSubscriptionId` fazia o consumidor
     * pedir `GET /preapproval/<payment_id>`, tomar 404 e deixar o evento
     * pendente PARA SEMPRE na varredura de reprocessamento — uma chamada ao MP
     * queimada por varredura, indefinidamente.
     */
    describe("id de assinatura em evento de pagamento", () => {
      it("payment sem preapproval_id => null (o payment id NUNCA vaza)", () => {
        const evento = provider.normalizarEvento({
          type: "payment",
          data: { id: "PAY-123" },
        });
        expect(evento.providerSubscriptionId).toBeNull();
        // A asserção que de fato importa: o id do pagamento não pode aparecer
        // neste campo sob nenhuma forma (nem string, nem coincidência).
        expect(evento.providerSubscriptionId).not.toBe("PAY-123");
      });

      it("payment com preapproval_id na RAIZ => usa o preapproval_id", () => {
        const evento = provider.normalizarEvento({
          type: "payment",
          data: { id: "PAY-123" },
          preapproval_id: "PREAPP-9",
        });
        expect(evento.providerSubscriptionId).toBe("PREAPP-9");
      });

      it("payment com preapproval_id em DATA => usa o preapproval_id", () => {
        const evento = provider.normalizarEvento({
          type: "payment",
          data: { id: "PAY-123", preapproval_id: "PREAPP-9" },
        });
        expect(evento.providerSubscriptionId).toBe("PREAPP-9");
      });

      it("preapproval continua usando data.id (sem regressão)", () => {
        const evento = provider.normalizarEvento({
          type: "preapproval",
          data: { id: "PREAPP-1" },
        });
        expect(evento.providerSubscriptionId).toBe("PREAPP-1");
      });

      it("subscription_preapproval também continua usando data.id", () => {
        // A segunda convenção de nome do MP para o mesmo recurso — se o fix
        // tivesse sido escrito como "só `preapproval` usa data.id", este caso
        // teria regredido em silêncio.
        const evento = provider.normalizarEvento({
          type: "subscription_preapproval",
          data: { id: "PREAPP-2" },
        });
        expect(evento.providerSubscriptionId).toBe("PREAPP-2");
      });
    });

    it("tipo desconhecido => 'desconhecido', sem lançar, com bruto preservado", () => {
      const payload = { id: "evt-4", type: "point_integration_wh", data: {} };
      const evento = provider.normalizarEvento(payload);
      expect(evento.tipo).toBe("desconhecido");
      expect(evento.bruto).toBe(payload);

      // Payload lixo também não pode lançar: 5xx viraria loop de reentrega.
      expect(() => provider.normalizarEvento(null)).not.toThrow();
      expect(provider.normalizarEvento(null).tipo).toBe("desconhecido");
    });
  });
});

describe("getBillingProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("default resolve para mercado_pago", () => {
    vi.stubEnv("BILLING_PROVIDER", "");
    expect(getBillingProvider().id).toBe("mercado_pago");
  });

  it("BILLING_PROVIDER=asaas lança erro explícito", () => {
    vi.stubEnv("BILLING_PROVIDER", "asaas");
    expect(() => getBillingProvider()).toThrow(
      "AsaasProvider ainda não implementado (#36)",
    );
  });

  it("resolve a cada chamada (sem cache de módulo congelando a env)", () => {
    vi.stubEnv("BILLING_PROVIDER", "mercado_pago");
    expect(getBillingProvider().id).toBe("mercado_pago");
    vi.stubEnv("BILLING_PROVIDER", "asaas");
    expect(() => getBillingProvider()).toThrow();
  });
});
