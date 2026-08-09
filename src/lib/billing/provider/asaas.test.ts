import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsaasProvider } from "./asaas";
import { getBillingProvider } from "./index";
import { BillingProviderError } from "./types";

/**
 * Testes unitários puros do adapter Asaas — sem rede, sem banco.
 *
 * Duas disciplinas herdadas do teste do Mercado Pago:
 *
 * 1. **Os formatos do gateway são escritos literalmente aqui**, não derivados do
 *    módulo sob teste. Se o teste montasse a data chamando o próprio formatador
 *    testado, trocar `America/Sao_Paulo` por UTC passaria verde — o teste
 *    seguiria o bug em vez de derrubá-lo.
 * 2. **Dinheiro é literal** (13700 centavos ↔ 137). Importar do calculator
 *    acoplaria o teste do adapter à regra de preço.
 *
 * E uma específica do Asaas: o payload de referência é o EVENTO REAL do sandbox
 * (`docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`), não um dublê
 * inventado. Foi ele que revelou o `&` literal no `id` do evento e os três
 * formatos de data convivendo no mesmo objeto — nenhum dublê do repo usava
 * esses formatos, e um adapter testado só contra dublê passaria verde contra a
 * produção real (precedente: 18/18 verdes contra MinIO, zero cópia no Oracle).
 */

const TOKEN_WEBHOOK = "token-de-webhook-do-asaas-com-32-chars";
const API_KEY = "$aact_hmlg_chave-de-teste";
const CLINIC_ID = "6d82d82e-324c-4eb1-a345-74421d2a501c";

/** Evento real entregue pelo sandbox em 03/08/2026, recortado no essencial. */
const EVENTO_REAL_SANDBOX = {
  id: "evt_a81765ea346714f51a9656a8c74aefa8&17706514",
  event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
  account: { id: CLINIC_ID, ownerId: null },
  dateCreated: "2026-08-03 19:55:12",
  authorization: {
    id: "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
    value: null,
    status: "CREATED",
    frequency: "MONTHLY",
    startDate: "08/09/2026",
    contractId: "IRIS-SANDBOX-001",
    customerId: "cus_000008561913",
    immediateQrCode: {
      expirationDate: "03/08/2026 20:55:10",
      conciliationIdentifier: "RSUTILCORREALTDA0000000001613059ASA",
    },
  },
};

function resposta(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  } as unknown as Response;
}

function headersCom(token: string | null): Headers {
  const h = new Headers();
  if (token !== null) h.set("asaas-access-token", token);
  return h;
}

function entrada(token: string | null) {
  return {
    corpoBruto: "{}",
    cabecalhos: headersCom(token),
    url: "https://irisclinica.ia.br/api/hooks/asaas",
  };
}

describe("AsaasProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN_WEBHOOK);
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY);
    vi.stubEnv("ASAAS_BASE_URL", "https://api-sandbox.asaas.com/v3");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("verificarAssinaturaWebhook", () => {
    it("aceita o token exato configurado no painel", () => {
      expect(
        new AsaasProvider().verificarAssinaturaWebhook(entrada(TOKEN_WEBHOOK)),
      ).toBe(true);
    });

    it("recusa token errado do MESMO tamanho", () => {
      // Mesmo comprimento de propósito: é o caminho que exercita de fato o
      // `timingSafeEqual`, e não o atalho da comparação de tamanho.
      const errado = "X".repeat(TOKEN_WEBHOOK.length);
      expect(errado).toHaveLength(TOKEN_WEBHOOK.length);
      expect(
        new AsaasProvider().verificarAssinaturaWebhook(entrada(errado)),
      ).toBe(false);
    });

    it("recusa token de tamanho diferente SEM lançar", () => {
      // `timingSafeEqual` lança com buffers de tamanhos diferentes. Um throw
      // aqui viraria 500 na rota, e 5xx repetido interrompe a fila do Asaas
      // depois de 15 falhas — evento não entregue some em 14 dias.
      expect(() =>
        new AsaasProvider().verificarAssinaturaWebhook(entrada("curto")),
      ).not.toThrow();
      expect(
        new AsaasProvider().verificarAssinaturaWebhook(entrada("curto")),
      ).toBe(false);
    });

    it("recusa quando o header não vem", () => {
      expect(
        new AsaasProvider().verificarAssinaturaWebhook(entrada(null)),
      ).toBe(false);
    });

    it("recusa TUDO quando a env não está configurada", () => {
      // Deploy sem o secret precisa rejeitar, nunca aceitar. O modo de falha
      // oposto — "passa porque não há token configurado" — abriria o endpoint
      // de faturamento para qualquer um.
      vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
      expect(
        new AsaasProvider().verificarAssinaturaWebhook(entrada(TOKEN_WEBHOOK)),
      ).toBe(false);
    });
  });

  describe("normalizarEvento", () => {
    it("lê o evento real do sandbox, com `&` literal no id", () => {
      const e = new AsaasProvider().normalizarEvento(EVENTO_REAL_SANDBOX);

      expect(e.eventId).toBe("evt_a81765ea346714f51a9656a8c74aefa8&17706514");
      expect(e.providerSubscriptionId).toBe(
        "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
      );
      // `CREATED` é autorização emitida e ainda não paga: nenhuma transição.
      expect(e.tipo).toBe("desconhecido");
      expect(e.providerChargeId).toBeNull();
      // `2026-08-03 19:55:12` é horário de Brasília, sem fuso no payload.
      // 19:55:12 -03:00 = 22:55:12Z. Ler como UTC erraria 3 horas.
      expect(e.ocorridoEm?.toISOString()).toBe("2026-08-03T22:55:12.000Z");
    });

    it("não lê data brasileira como se fosse americana", () => {
      // `03/08/2026` é 3 de AGOSTO. `new Date("03/08/2026")` do JS leria
      // 8 de MARÇO — erro de cinco meses que não estoura em lugar nenhum.
      const e = new AsaasProvider().normalizarEvento({
        ...EVENTO_REAL_SANDBOX,
        dateCreated: "03/08/2026 20:55:10",
      });
      expect(e.ocorridoEm?.toISOString()).toBe("2026-08-03T23:55:10.000Z");
    });

    it("autorização ACTIVE vira assinatura.autorizada", () => {
      const e = new AsaasProvider().normalizarEvento({
        ...EVENTO_REAL_SANDBOX,
        event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
        authorization: {
          ...EVENTO_REAL_SANDBOX.authorization,
          status: "ACTIVE",
        },
      });
      expect(e.tipo).toBe("assinatura.autorizada");
    });

    it.each(["CANCELLED", "REFUSED", "EXPIRED"])(
      "autorização %s vira assinatura.cancelada (estado terminal)",
      (status) => {
        // Os três são terminais no Asaas: não dá para retomar, só criar outra
        // autorização. Mapear para `pausada` sugeriria que dá para religar.
        const e = new AsaasProvider().normalizarEvento({
          ...EVENTO_REAL_SANDBOX,
          authorization: { ...EVENTO_REAL_SANDBOX.authorization, status },
        });
        expect(e.tipo).toBe("assinatura.cancelada");
      },
    );

    it("cobrança RECEIVED com nossa referência vira cobranca.paga", () => {
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_x&1",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-10-08 10:00:00",
        payment: {
          id: "pay_080225913252",
          status: "RECEIVED",
          value: 137,
          externalReference: "cycle:11111111-1111-1111-1111-111111111111",
        },
      });
      expect(e.tipo).toBe("cobranca.paga");
      expect(e.providerChargeId).toBe("pay_080225913252");
      expect(e.referenciaExterna).toBe(
        "cycle:11111111-1111-1111-1111-111111111111",
      );
    });

    it("cobrança OVERDUE com nossa referência vira cobranca.vencida", () => {
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_y&1",
        event: "PAYMENT_OVERDUE",
        payment: {
          id: "pay_2",
          status: "OVERDUE",
          externalReference: "cycle:22222222-2222-2222-2222-222222222222",
        },
      });
      expect(e.tipo).toBe("cobranca.vencida");
    });

    it("cobrança sem nossa referência NÃO promete conciliação", () => {
      // Sem `externalReference` não há ciclo a conciliar. Emitir `cobranca.paga`
      // aqui faria o consumidor procurar um ciclo que não existe.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_z&1",
        event: "PAYMENT_RECEIVED",
        payment: { id: "pay_3", status: "RECEIVED" },
      });
      expect(e.tipo).toBe("pagamento.aprovado");
      expect(e.referenciaExterna).toBeNull();
    });

    it("instrução REFUSED usa o paymentId, não o id da instrução", () => {
      // A instrução recusada (saldo insuficiente) é o principal modo de falha
      // do débito automático, e chega SEM `payment.status`. Devolver o id da
      // INSTRUÇÃO faria `GET /payments/{id}` tomar 404 em loop.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_w&1",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "9b0b1a10-0000-4000-8000-000000000000",
          status: "REFUSED",
          paymentId: "pay_777",
          authorization: { id: "53da5204-8dd1-4cf4-9604-d134e1e6fe04" },
        },
      });
      expect(e.providerChargeId).toBe("pay_777");
      expect(e.providerSubscriptionId).toBe(
        "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
      );
      expect(e.tipo).toBe("pagamento.recusado");
    });

    it.each([null, undefined, 42, "texto", {}, { event: "COISA_NOVA" }])(
      "nunca lança com payload inesperado (%p)",
      (payload) => {
        // O handler precisa responder 200 mesmo para evento que não entende:
        // 5xx repetido desliga a fila do Asaas.
        const e = new AsaasProvider().normalizarEvento(payload);
        expect(e.tipo).toBe("desconhecido");
        expect(e.eventId).toBe("");
      },
    );
  });

  describe("iniciarVinculoPagamento", () => {
    const pedido = {
      assinante: {
        clinicId: CLINIC_ID,
        nomeClinica: "Clínica Exemplo",
        emailResponsavel: "responsavel@exemplo.com",
        cpfCnpj: "29.811.201/0001-50",
      },
      metodo: "pix" as const,
      urlRetorno: "https://irisclinica.ia.br/assinatura",
      referenciaExterna: `clinic:${CLINIC_ID}`,
    };

    it("recusa sem CPF/CNPJ, nomeando o motivo", async () => {
      // O Asaas exige `cpfCnpj` na criação do cliente. Falhar aqui é melhor que
      // tomar um 400 genérico — e muito melhor que inventar um documento.
      const { cpfCnpj: _ignorado, ...semDocumento } = pedido.assinante;
      await expect(
        new AsaasProvider().iniciarVinculoPagamento({
          ...pedido,
          assinante: semDocumento,
        }),
      ).rejects.toThrow(/CPF\/CNPJ/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("cria cliente e autorização de valor VARIÁVEL", async () => {
      fetchMock
        .mockResolvedValueOnce(resposta({ id: "cus_000008561913" }))
        .mockResolvedValueOnce(
          resposta({
            id: "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
            status: "CREATED",
            payload: "00020126580014BR.GOV.BCB.PIX...",
          }),
        );

      const criado = await new AsaasProvider().iniciarVinculoPagamento(pedido);

      expect(criado.providerVinculoId).toBe(
        "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
      );
      expect(criado.status).toBe("pendente");
      expect(criado.checkoutUrl).toBe("00020126580014BR.GOV.BCB.PIX...");

      const [urlCliente, initCliente] = fetchMock.mock.calls[0]!;
      expect(urlCliente).toBe("https://api-sandbox.asaas.com/v3/customers");
      // O Asaas autentica por header `access_token` — não é Bearer.
      expect(initCliente.headers.access_token).toBe(API_KEY);
      // `User-Agent` é obrigatório em contas raiz criadas após 13/06/2024.
      expect(initCliente.headers["User-Agent"]).toBeTruthy();
      // Máscara removida: o Asaas quer só dígitos.
      expect(JSON.parse(initCliente.body).cpfCnpj).toBe("29811201000150");

      const [urlAut, initAut] = fetchMock.mock.calls[1]!;
      expect(urlAut).toBe(
        "https://api-sandbox.asaas.com/v3/pix/automatic/authorizations",
      );
      const corpo = JSON.parse(initAut.body);
      // A ausência de `value` É a Jornada 3 de valor variável. Preenchê-lo
      // travaria o débito mensal no valor de hoje — a origem exata do
      // subfaturamento silencioso descrito em `types.ts`.
      expect(corpo).not.toHaveProperty("value");
      expect(corpo).not.toHaveProperty("minLimitValue");
      // `SUBSCRIPTION` exigiria `value` fixo; `MANUAL` é o que permite variável.
      expect(corpo.paymentCreationMode).toBe("MANUAL");
      // Retentativa é decisão de cobrança do Iris, não do gateway.
      expect(corpo.retryPolicy).toBe("NOT_ALLOWED");
      // `contractId` tem limite de 35 no Asaas; o UUID com hífen tem 36.
      expect(corpo.contractId).toBe("6d82d82e324c4eb1a34574421d2a501c");
      expect(corpo.contractId.length).toBeLessThanOrEqual(35);
    });

    it("propaga a recusa do Asaas com status e corpo preservados", async () => {
      fetchMock.mockResolvedValueOnce(
        resposta(
          { errors: [{ code: "invalid_environment", description: "chave" }] },
          401,
        ),
      );
      const erro = await new AsaasProvider()
        .iniciarVinculoPagamento(pedido)
        .catch((e: unknown) => e);

      // Sem status e corpo o chamador não distingue "chave do ambiente errado"
      // de "documento inválido" — e a varredura não sabe se retenta.
      expect(erro).toBeInstanceOf(BillingProviderError);
      expect((erro as BillingProviderError).status).toBe(401);
      expect((erro as BillingProviderError).corpo).toMatchObject({
        errors: [{ code: "invalid_environment" }],
      });
    });
  });

  describe("emitirCobrancaDeCiclo", () => {
    const cobranca = {
      vinculoId: "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
      valorCentavos: 13700,
      referenciaExterna: "cycle:11111111-1111-1111-1111-111111111111",
      descricao: "Iris — outubro/2026",
      // 09/10/2026 01:00 UTC é ainda 08/10/2026 em São Paulo.
      vencimento: new Date("2026-10-09T01:00:00.000Z"),
    };

    it("debita dentro da autorização, com data no fuso de São Paulo", async () => {
      fetchMock
        // 1) busca de idempotência: nada emitido ainda
        .mockResolvedValueOnce(resposta({ object: "list", data: [] }))
        // 2) autorização, de onde sai o `customer`
        .mockResolvedValueOnce(resposta({ customerId: "cus_000008561913" }))
        // 3) a cobrança
        .mockResolvedValueOnce(
          resposta({
            id: "pay_080225913252",
            status: "PENDING",
            invoiceUrl: "https://www.asaas.com/i/080225913252",
          }),
        );

      const emitida = await new AsaasProvider().emitirCobrancaDeCiclo(cobranca);

      expect(emitida.providerChargeId).toBe("pay_080225913252");
      expect(emitida.status).toBe("pendente");
      expect(emitida.urlPagamento).toBe("https://www.asaas.com/i/080225913252");

      const [url, init] = fetchMock.mock.calls[2]!;
      expect(url).toBe("https://api-sandbox.asaas.com/v3/payments");
      const corpo = JSON.parse(init.body);
      // Sem este campo o Asaas geraria "uma cobrança Pix convencional": um QR
      // para alguém pagar à mão. A clínica não seria debitada e ninguém veria.
      expect(corpo.pixAutomaticAuthorizationId).toBe(cobranca.vinculoId);
      expect(corpo.customer).toBe("cus_000008561913");
      // Centavos → reais só na borda.
      expect(corpo.value).toBe(137);
      // `toISOString().slice(0,10)` daria 2026-10-09 e adiantaria o vencimento
      // em um dia — o bastante para cair fora da janela de 2 a 10 dias úteis.
      expect(corpo.dueDate).toBe("2026-10-08");
      expect(corpo.externalReference).toBe(cobranca.referenciaExterna);
    });

    it("não cobra duas vezes o mesmo ciclo", async () => {
      // O Asaas não tem header de idempotência e a própria doc avisa que a API
      // permite duplicatas. A barreira é a busca por `externalReference`.
      fetchMock.mockResolvedValueOnce(
        resposta({
          object: "list",
          data: [{ id: "pay_ja_existe", status: "PENDING" }],
        }),
      );

      const emitida = await new AsaasProvider().emitirCobrancaDeCiclo(cobranca);

      expect(emitida.providerChargeId).toBe("pay_ja_existe");
      // Uma chamada só: nenhum POST foi feito.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falha na busca de idempotência ABORTA a emissão", async () => {
      // Engolir o erro transformaria "não consegui verificar" em "não existe",
      // que é exatamente o caminho para cobrar a clínica duas vezes.
      fetchMock.mockResolvedValueOnce(resposta({ errors: [] }, 500));

      await expect(
        new AsaasProvider().emitirCobrancaDeCiclo(cobranca),
      ).rejects.toBeInstanceOf(BillingProviderError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("consultarCobranca", () => {
    it.each([
      ["RECEIVED", "paga"],
      ["RECEIVED_IN_CASH", "paga"],
      ["CONFIRMED", "paga"],
      ["OVERDUE", "recusada"],
      ["REFUNDED", "estornada"],
      ["CHARGEBACK_REQUESTED", "estornada"],
      ["PENDING", "pendente"],
      ["AWAITING_RISK_ANALYSIS", "pendente"],
      ["ESTADO_NOVO_DO_GATEWAY", "pendente"],
    ])("%s → %s", async (statusAsaas, esperado) => {
      fetchMock.mockResolvedValueOnce(
        resposta({ id: "pay_1", status: statusAsaas, value: 137 }),
      );
      const r = await new AsaasProvider().consultarCobranca("pay_1");
      expect(r.status).toBe(esperado);
      // Decimal do gateway volta a inteiro na entrada do sistema.
      expect(r.valorCentavos).toBe(13700);
    });
  });

  describe("consultarVinculo", () => {
    it("CREATED ainda NÃO é autorizada", async () => {
      // Tratar `CREATED` como autorizada liberaria o cadastro de paciente de
      // uma clínica que ainda não pagou o QR de ativação.
      fetchMock.mockResolvedValueOnce(resposta({ status: "CREATED" }));
      expect((await new AsaasProvider().consultarVinculo("aut-1")).status).toBe(
        "pendente",
      );
    });

    it("ACTIVE é autorizada", async () => {
      fetchMock.mockResolvedValueOnce(resposta({ status: "ACTIVE" }));
      expect((await new AsaasProvider().consultarVinculo("aut-1")).status).toBe(
        "autorizada",
      );
    });
  });

  describe("getBillingProvider", () => {
    it("BILLING_PROVIDER=asaas resolve o AsaasProvider", () => {
      // Até 08/08/2026 este caminho LANÇAVA ("não implementado"). É a trava que
      // derruba o CI se alguém reverter a ligação do adapter.
      vi.stubEnv("BILLING_PROVIDER", "asaas");
      const p = getBillingProvider();
      expect(p).toBeInstanceOf(AsaasProvider);
      expect(p.id).toBe("asaas");
    });

    it("valor desconhecido continua estourando", () => {
      // `mercadopago` sem underscore já derrubou todo POST do webhook com 500
      // em produção (04/08/2026). O erro explícito é a lição daquele incidente.
      vi.stubEnv("BILLING_PROVIDER", "asaas_pix");
      expect(() => getBillingProvider()).toThrow(
        /BILLING_PROVIDER desconhecido/,
      );
    });
  });
});
