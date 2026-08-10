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

  describe("iniciarVinculoPagamento", () => {
    const ASSINANTE = {
      clinicId: "clinic-1",
      nomeClinica: "Clínica Aurora",
      emailResponsavel: "responsavel@aurora.test",
    };

    it("cria o vínculo sem cobrar e devolve id + checkout", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({
          id: "2c938084",
          init_point: "https://mp.test/checkout/2c938084",
          status: "pending",
        }),
      );

      const resultado = await new MercadoPagoProvider().iniciarVinculoPagamento(
        {
          assinante: ASSINANTE,
          metodo: "cartao",
          urlRetorno: "https://iris.test/billing/retorno",
          referenciaExterna: "vinculo_clinic-1",
          tetoCentavos: 15_000,
        },
      );

      const chamada = ultimaChamada(fetchMock);
      expect(chamada.url).toBe("https://api.mercadopago.test/preapproval");
      expect(chamada.metodo).toBe("POST");
      expect(chamada.cabecalhos.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(chamada.cabecalhos["X-Idempotency-Key"]).toBe("vinculo_clinic-1");
      expect(chamada.corpo.external_reference).toBe("vinculo_clinic-1");
      expect(chamada.corpo.payer_email).toBe("responsavel@aurora.test");
      expect(chamada.corpo.back_url).toBe("https://iris.test/billing/retorno");
      // O valor que vai ao MP é o TETO autorizado (R$150), não uma cobrança.
      expect(chamada.corpo.auto_recurring.transaction_amount).toBe(150);

      expect(resultado).toEqual({
        providerVinculoId: "2c938084",
        // D21: o trilho do MP é redirect de verdade — `init_point` É uma URL.
        autorizacao: {
          forma: "redirect",
          url: "https://mp.test/checkout/2c938084",
        },
        status: "pendente",
      });
    });

    it("sem teto informado usa o piso mínimo, nunca um valor de ciclo", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({
          id: "x",
          init_point: "https://mp.test/x",
          status: "pending",
        }),
      );

      await new MercadoPagoProvider().iniciarVinculoPagamento({
        assinante: ASSINANTE,
        metodo: "pix",
        urlRetorno: "https://iris.test/r",
        referenciaExterna: "ref",
      });

      // 1,00 = piso do MP. Se alguém reintroduzir "cobrar na ativação", este
      // número deixa de ser 1 e o teste quebra.
      expect(
        ultimaChamada(fetchMock).corpo.auto_recurring.transaction_amount,
      ).toBe(1);
    });

    it("HTTP 400 vira BillingProviderError com status e corpo preservados", async () => {
      fetchMock.mockResolvedValue(
        respostaOk(
          { message: "invalid payer_email", error: "bad_request" },
          400,
        ),
      );

      const promessa = new MercadoPagoProvider().iniciarVinculoPagamento({
        assinante: { clinicId: "c", nomeClinica: "C", emailResponsavel: "x" },
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

  it("cancelarVinculo faz PUT com status cancelled", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "abc", status: "cancelled" }));

    await new MercadoPagoProvider().cancelarVinculo("abc");

    const chamada = ultimaChamada(fetchMock);
    expect(chamada.metodo).toBe("PUT");
    expect(chamada.url).toBe("https://api.mercadopago.test/preapproval/abc");
    expect(chamada.corpo).toEqual({ status: "cancelled" });
  });

  describe("consultarVinculo — mapeamento dos 4 status", () => {
    const casos = [
      ["pending", "pendente"],
      ["authorized", "autorizada"],
      ["paused", "pausada"],
      ["cancelled", "cancelada"],
    ] as const;

    it.each(casos)("%s → %s", async (statusMP, esperado) => {
      fetchMock.mockResolvedValue(respostaOk({ id: "abc", status: statusMP }));

      const resultado = await new MercadoPagoProvider().consultarVinculo("abc");
      const chamada = ultimaChamada(fetchMock);
      expect(chamada.metodo).toBe("GET");
      expect(chamada.url).toBe("https://api.mercadopago.test/preapproval/abc");
      expect(resultado.status).toBe(esperado);
    });
  });

  describe("emitirCobrancaDeCiclo", () => {
    const PEDIDO = {
      vinculoId: "PREAPP-9",
      valorCentavos: 19_999,
      referenciaExterna: "cycle:ciclo-42",
      descricao: "Iris — apuração de julho/2026",
      vencimento: new Date("2026-08-10T03:00:00.000Z"),
    };

    it("emite pagamento avulso com valor, referência e idempotência corretos", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({ id: 1234567890, status: "pending" }),
      );

      const resultado = await new MercadoPagoProvider().emitirCobrancaDeCiclo(
        PEDIDO,
      );

      const chamada = ultimaChamada(fetchMock);
      expect(chamada.url).toBe("https://api.mercadopago.test/v1/payments");
      expect(chamada.metodo).toBe("POST");
      // 19999 centavos → 199.99. Um `/100` ingênuo daria 199.99000000000001 e
      // um `Math.round` no lugar errado daria 200.
      expect(chamada.corpo.transaction_amount).toBe(199.99);
      expect(chamada.corpo.external_reference).toBe("cycle:ciclo-42");
      expect(chamada.corpo.description).toBe("Iris — apuração de julho/2026");
      expect(chamada.corpo.date_of_expiration).toBe("2026-08-10T03:00:00.000Z");
      // Sem esta chave, um retry do job de fechamento cobra o ciclo duas vezes.
      expect(chamada.cabecalhos["X-Idempotency-Key"]).toBe("cycle:ciclo-42");

      // Id numérico do MP vira string na fronteira — quem persiste guarda texto.
      expect(resultado.providerChargeId).toBe("1234567890");
      expect(resultado.status).toBe("pendente");
      expect(resultado.urlPagamento).toBeUndefined();
    });

    it("a chave de idempotência é a do ciclo, não a do vínculo", async () => {
      fetchMock.mockResolvedValue(respostaOk({ id: "p1", status: "pending" }));
      await new MercadoPagoProvider().emitirCobrancaDeCiclo(PEDIDO);
      expect(ultimaChamada(fetchMock).cabecalhos["X-Idempotency-Key"]).not.toBe(
        "PREAPP-9",
      );
    });

    it("Pix devolve a URL de pagamento", async () => {
      fetchMock.mockResolvedValue(
        respostaOk({
          id: "p2",
          status: "pending",
          point_of_interaction: {
            transaction_data: { ticket_url: "https://mp.test/pix/p2" },
          },
        }),
      );

      const resultado = await new MercadoPagoProvider().emitirCobrancaDeCiclo(
        PEDIDO,
      );
      expect(resultado.urlPagamento).toBe("https://mp.test/pix/p2");
    });

    it("2xx sem id falha alto (cobrança irreconciliável)", async () => {
      fetchMock.mockResolvedValue(respostaOk({ status: "pending" }));
      await expect(
        new MercadoPagoProvider().emitirCobrancaDeCiclo(PEDIDO),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });
  });

  describe("consultarCobranca — mapeamento de status", () => {
    const casos = [
      ["approved", "paga"],
      ["rejected", "recusada"],
      ["cancelled", "recusada"],
      ["refunded", "estornada"],
      ["charged_back", "estornada"],
      ["pending", "pendente"],
      ["in_process", "pendente"],
      ["status_que_o_mp_ainda_nao_inventou", "pendente"],
    ] as const;

    it.each(casos)("%s → %s", async (statusMP, esperado) => {
      fetchMock.mockResolvedValue(
        respostaOk({ id: "p1", status: statusMP, transaction_amount: 199.99 }),
      );

      const resultado = await new MercadoPagoProvider().consultarCobranca("p1");
      const chamada = ultimaChamada(fetchMock);
      expect(chamada.metodo).toBe("GET");
      expect(chamada.url).toBe("https://api.mercadopago.test/v1/payments/p1");
      expect(resultado.status).toBe(esperado);
      // Decimal → centavos inteiros: 199.99*100 dá 19998.999… em ponto
      // flutuante; sem `Math.round` o valor conciliado sairia 1 centavo menor.
      expect(resultado.valorCentavos).toBe(19_999);
    });

    it("resposta sem valor devolve 0, sem NaN atravessando a porta", async () => {
      fetchMock.mockResolvedValue(respostaOk({ id: "p1", status: "approved" }));
      const resultado = await new MercadoPagoProvider().consultarCobranca("p1");
      expect(resultado.valorCentavos).toBe(0);
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
        cabecalhos: headers(
          `ts=${AGORA},v1=${assinar(AGORA, "outro-segredo")}`,
        ),
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
        provider.normalizarEvento({
          id: "e",
          type: "preapproval",
          status: "paused",
        }).tipo,
      ).toBe("assinatura.pausada");
    });

    it("payment SEM external_reference => vocabulário genérico pagamento.*", () => {
      expect(
        provider.normalizarEvento({
          id: "evt-2",
          type: "payment",
          action: "payment.updated",
          status: "approved",
          data: { id: "pay-1" },
        }).tipo,
      ).toBe("pagamento.aprovado");

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
     * A distinção que o novo trilho depende: um pagamento com
     * `external_reference` = `cycle:<id>` é a cobrança de um ciclo que NÓS
     * emitimos e é conciliável; sem referência, não há ciclo a conciliar e
     * emitir `cobranca.*` deixaria o evento pendente para sempre.
     */
    describe("payment COM external_reference => cobranca.*", () => {
      function eventoPagamento(extra: Record<string, unknown>) {
        return provider.normalizarEvento({
          id: "evt-9",
          type: "payment",
          external_reference: "cycle:ciclo-42",
          data: { id: "PAY-777" },
          ...extra,
        });
      }

      it("approved => cobranca.paga, com providerChargeId preenchido", () => {
        const evento = eventoPagamento({ status: "approved" });
        expect(evento.tipo).toBe("cobranca.paga");
        expect(evento.providerChargeId).toBe("PAY-777");
        expect(evento.referenciaExterna).toBe("cycle:ciclo-42");
        // Pagamento não carrega vínculo aqui: o campo de assinatura fica null.
        expect(evento.providerSubscriptionId).toBeNull();
      });

      it("rejected => cobranca.recusada", () => {
        expect(eventoPagamento({ status: "rejected" }).tipo).toBe(
          "cobranca.recusada",
        );
      });

      it("cancelled por expiração => cobranca.vencida (não recusada)", () => {
        expect(
          eventoPagamento({
            status: "cancelled",
            status_detail: "expired",
          }).tipo,
        ).toBe("cobranca.vencida");
      });

      it("cancelled sem expiração continua recusada", () => {
        expect(
          eventoPagamento({
            status: "cancelled",
            status_detail: "by_collector",
          }).tipo,
        ).toBe("cobranca.recusada");
      });
    });

    it("preapproval nunca preenche providerChargeId", () => {
      const evento = provider.normalizarEvento({
        id: "evt-10",
        type: "preapproval",
        status: "authorized",
        data: { id: "PREAPP-1" },
      });
      expect(evento.providerChargeId).toBeNull();
      // O id do vínculo não pode escapar como se fosse id de cobrança: o
      // consumidor pediria GET /v1/payments/PREAPP-1 e tomaria 404 em loop.
      expect(evento.providerChargeId).not.toBe("PREAPP-1");
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

  it("env ausente ou vazia LANÇA — não há default silencioso", () => {
    // Havia um default (`mercado_pago`). Ele transformava "perdi a env" em
    // "troquei de gateway sem avisar" — e o gateway de volta é justamente aquele
    // onde o Pix nunca foi implementado (D24). Um deploy que perca a variável
    // precisa quebrar alto, não faturar pelo trilho errado em silêncio.
    vi.stubEnv("BILLING_PROVIDER", "");
    expect(() => getBillingProvider()).toThrow(
      /BILLING_PROVIDER não configurada/,
    );
  });

  it("BILLING_PROVIDER desconhecido lança erro explícito", () => {
    // `asaas` deixou de lançar em 08/08/2026 (#231) — a cobertura desse caminho
    // mudou de casa e mora em `asaas.test.ts`. O que continua tendo de estourar
    // é valor NÃO reconhecido: `mercadopago` sem underscore derrubou todo POST
    // do webhook com 500 em produção (04/08/2026), e o erro explícito é a lição
    // daquele incidente.
    vi.stubEnv("BILLING_PROVIDER", "mercadopago");
    expect(() => getBillingProvider()).toThrow(
      "Provedor de pagamento desconhecido: mercadopago",
    );
  });

  it("resolve a cada chamada (sem cache de módulo congelando a env)", () => {
    vi.stubEnv("BILLING_PROVIDER", "mercado_pago");
    expect(getBillingProvider().id).toBe("mercado_pago");
    // Trocar a env DEPOIS de já ter resolvido uma vez precisa devolver o outro
    // adapter: uma instância guardada em `const` de módulo congelaria a env e
    // faria o primeiro teste que importa o módulo decidir o provider de todos.
    vi.stubEnv("BILLING_PROVIDER", "asaas");
    expect(getBillingProvider().id).toBe("asaas");
  });
});
