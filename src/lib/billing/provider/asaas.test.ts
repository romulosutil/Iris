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
    // D46: normalizarEvento loga console.warn quando purpose/retryAttempt
    // fogem do contrato. Mockado aqui p/ toda a suíte não poluir a saída do
    // Vitest com avisos esperados (ex: "SCHEDULE é a instrução original...").
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

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
      // ...e PRESERVA o id da instrução (D35). Ele não substitui o da cobrança
      // — serve para outro recurso: é o único endereço do `refusalReason`.
      // Descartá-lo (o estado até o D35) deixava `motivoRecusa` `null` por
      // construção, sem nada no fluxo capaz de recuperá-lo depois.
      expect(e.providerInstructionId).toBe(
        "9b0b1a10-0000-4000-8000-000000000000",
      );
    });

    it("evento de cobrança comum não inventa id de instrução", () => {
      // `providerInstructionId` só existe quando o gateway modela a instrução.
      // Cair no id da cobrança aqui faria a consulta do motivo bater em
      // `/paymentInstructions/pay_…` e tomar 404 em toda recusa.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_sem_instrucao&1",
        event: "PAYMENT_OVERDUE",
        payment: { id: "pay_9", status: "OVERDUE" },
      });
      expect(e.providerInstructionId).toBeNull();
    });

    /**
     * #322 · D-5 — `purpose`/`retryAttempt`.
     *
     * ⚠️ Estes payloads são **contrato lido da doc**, não evento medido: o
     * sandbox não ativa Pix Automático (#321), então nenhuma instrução — logo
     * nenhuma retentativa — existe lá. O que os casos abaixo fixam é o
     * NORMALIZADOR (vocabulário fechado, faixa 1..3, objeto sempre presente);
     * que o Asaas mande de fato estes nomes só a produção prova.
     */
    it("instrução REFUSED de RETENTATIVA traz propósito e número da tentativa", () => {
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_retry&2",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_retry_2",
          status: "REFUSED",
          paymentId: "pay_778",
          purpose: "RETRY_AFTER_DUE_DATE",
          retryAttempt: 2,
          authorization: { id: "auth_1" },
        },
      });

      expect(e.tipo).toBe("pagamento.recusado");
      expect(e.retentativa).toEqual({
        proposito: "RETRY_AFTER_DUE_DATE",
        tentativa: 2,
      });
    });

    it("evento sem paymentInstruction traz o objeto com os dois nulos", () => {
      // O campo existe SEMPRE. Se fosse opcional, todo consumidor precisaria de
      // `?.` — e o guard que impede recarimbar `past_due` é justamente o que não
      // pode depender de alguém ter lembrado do encadeamento opcional.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_sem_instrucao&2",
        event: "PAYMENT_OVERDUE",
        payment: { id: "pay_9", status: "OVERDUE" },
      });
      expect(e.retentativa).toEqual({ proposito: null, tentativa: null });
    });

    it("purpose fora do vocabulário conhecido vira null, sem repassar a string crua", () => {
      // Repassar cru faria o consumidor comparar contra um valor que ele não
      // conhece — adivinhação, que é o defeito que a #318 existe para matar.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_purpose_novo&1",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_novo",
          status: "REFUSED",
          paymentId: "pay_779",
          purpose: "PROPOSITO_QUE_A_DOC_NAO_LISTA",
          retryAttempt: 1,
        },
      });
      expect(e.retentativa.proposito).toBeNull();
      // ...e o campo vizinho continua sendo lido: um valor novo num campo não
      // pode apagar o outro.
      expect(e.retentativa.tentativa).toBe(1);
    });

    it("D46: instrução real sem purpose/retryAttempt válidos loga o envelope cru", () => {
      const warn = vi.spyOn(console, "warn");
      new AsaasProvider().normalizarEvento({
        id: "evt_purpose_novo&2",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_novo_2",
          status: "REFUSED",
          paymentId: "pay_782",
          purpose: "PROPOSITO_QUE_A_DOC_NAO_LISTA",
          retryAttempt: 1,
        },
      });
      expect(warn).toHaveBeenCalledWith(
        "[billing-retentativa-envelope-inesperado] purpose/retryAttempt fora do contrato lido da doc (#322, D46)",
        expect.objectContaining({
          providerInstructionId: "pi_novo_2",
          purposeBruto: "PROPOSITO_QUE_A_DOC_NAO_LISTA",
          retryAttemptBruto: 1,
        }),
      );
    });

    it("D46: instrução real com purpose e retryAttempt válidos não loga nada", () => {
      const warn = vi.spyOn(console, "warn");
      new AsaasProvider().normalizarEvento({
        id: "evt_retry_ok&1",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_ok",
          status: "REFUSED",
          paymentId: "pay_783",
          purpose: "RETRY_AFTER_DUE_DATE",
          retryAttempt: 2,
        },
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it("SCHEDULE é a instrução original do ciclo, não uma retentativa", () => {
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_schedule&1",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_sched",
          status: "REFUSED",
          paymentId: "pay_780",
          purpose: "SCHEDULE",
        },
      });
      expect(e.retentativa).toEqual({ proposito: "SCHEDULE", tentativa: null });
    });

    it.each([
      ["zero", 0],
      ["acima do teto de 3", 4],
      ["string numérica", "2"],
      ["decimal", 1.5],
      ["ausente", undefined],
      ["nulo", null],
    ])("retryAttempt %s vira null", (_rotulo, retryAttempt) => {
      // A régua é estrita: `Number("2")` daria 2, e um `4` aceito significaria
      // que a doc mudou — informação que uma coerção complacente apagaria.
      const e = new AsaasProvider().normalizarEvento({
        id: "evt_attempt&1",
        event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
        paymentInstruction: {
          id: "pi_attempt",
          status: "REFUSED",
          paymentId: "pay_781",
          purpose: "RETRY_AFTER_DUE_DATE",
          retryAttempt,
        },
      });
      expect(e.retentativa.tentativa).toBeNull();
      // O propósito continua legível: um campo ilegível não contamina o outro.
      expect(e.retentativa.proposito).toBe("RETRY_AFTER_DUE_DATE");
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
      // D21: o BR Code sai na forma que ele é — não disfarçado de URL de
      // checkout. Se alguém reintroduzir `checkoutUrl` aqui, isto quebra.
      // D22: o valor cobrado sobe junto. Sem ele a tela mostraria um QR que
      // debita da clínica sem dizer quanto — era o débito.
      expect(criado.autorizacao).toEqual({
        forma: "pix_copia_e_cola",
        brCode: "00020126580014BR.GOV.BCB.PIX...",
        valorAtivacaoCentavos: 1,
      });

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
      // #317: piso do teto que o pagador autoriza no app do banco. Literal de
      // propósito (disciplina 2 do topo): 39 é o que sai NA REQUISIÇÃO. Derivar
      // de `PISO_TETO_AUTORIZACAO_CENTAVOS` faria o teste seguir a constante em
      // vez de vigiá-la. Medido em 15/08/2026 (#321): aceito com 200 e eco na
      // resposta, sem `value` — a Jornada 3 de valor variável continua de pé.
      expect(corpo.minLimitValue).toBe(39);
      // `SUBSCRIPTION` exigiria `value` fixo; `MANUAL` é o que permite variável.
      expect(corpo.paymentCreationMode).toBe("MANUAL");
      // #317: irreversível. O Asaas não permite habilitar retentativa depois da
      // criação; autorização criada sem isto fica permanentemente sem direito a
      // retentativa, e o conserto é novo QR + novo consentimento do cliente.
      expect(corpo.retryPolicy).toBe("ALLOW_THREE_IN_SEVEN_DAYS");
      // `contractId` tem limite de 35 no Asaas; o UUID com hífen tem 36.
      expect(corpo.contractId).toBe("6d82d82e324c4eb1a34574421d2a501c");
      expect(corpo.contractId.length).toBeLessThanOrEqual(35);
      // D22: `immediateQrCode` É a cobrança que ativa a autorização. O Asaas
      // fala decimal em reais, então R$ 0,01 = 0.01 — asserir o número exato é
      // o que faz mexer na constante ficar vermelho aqui, e não passar calado
      // até a fatura da clínica.
      // Literal de propósito (disciplina 2 do topo do arquivo): derivar de
      // `VALOR_ATIVACAO_PADRAO_CENTAVOS` faria o teste seguir a constante em
      // vez de vigiá-la, e mexer nela passaria verde.
      expect(corpo.immediateQrCode.originalValue).toBe(0.01);
      expect(corpo.immediateQrCode.expirationSeconds).toBe(86400);
    });

    it("ignora `tetoCentavos` — teto não é valor de cobrança (D22)", async () => {
      // Antes do D22 este campo era lido como valor da ativação: um campo
      // chamado "teto" decidindo quanto sai da conta da clínica. Na Jornada 3
      // de valor variável não existe teto para respeitar, e o único jeito de
      // provar que ele voltou a ser inerte é passá-lo alto e medir a cobrança.
      fetchMock
        .mockResolvedValueOnce(resposta({ id: "cus_000008561913" }))
        .mockResolvedValueOnce(
          resposta({
            id: "53da5204-8dd1-4cf4-9604-d134e1e6fe04",
            status: "CREATED",
            payload: "00020126580014BR.GOV.BCB.PIX...",
          }),
        );

      const criado = await new AsaasProvider().iniciarVinculoPagamento({
        ...pedido,
        tetoCentavos: 15_000,
      });

      const corpo = JSON.parse(fetchMock.mock.calls[1]![1].body);
      expect(corpo.immediateQrCode.originalValue).toBe(0.01);
      // #317: agora existe UM campo de teto no payload — `minLimitValue`. Ele é
      // o piso do teto (derivado do preço de uma ficha), nunca o `tetoCentavos`
      // que o chamador manda. Sem esta linha, alguém "conserta" o D22 ligando
      // um no outro e o valor do cliente volta a mandar no payload.
      expect(corpo.minLimitValue).toBe(39);
      expect(criado.autorizacao).toMatchObject({
        valorAtivacaoCentavos: 1,
      });
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

  /**
   * #290 — cobrança do débito de reativação.
   *
   * A diferença que importa em relação a `emitirCobrancaDeCiclo` é o NEGATIVO:
   * aqui `pixAutomaticAuthorizationId` **não pode** ir no corpo. A autorização
   * de Pix Automático foi revogada — é o ato que produziu o cancelamento — e
   * anexá-la mandaria o Asaas debitar um trilho morto, produzindo uma cobrança
   * que ninguém consegue pagar. Também não há consulta à autorização: o cliente
   * vem por parâmetro, de `subscription.provider_customer_id`.
   */
  describe("emitirCobrancaAvulsa", () => {
    const debito = {
      clienteId: "cus_000008561913",
      valorCentavos: 1300,
      referenciaExterna: "debito:22222222-2222-2222-2222-222222222222",
      descricao: "Iris — débito do ciclo interrompido",
      vencimento: new Date("2026-10-09T01:00:00.000Z"),
    };

    it("cobra Pix comum contra o cliente, sem tocar na autorização revogada", async () => {
      fetchMock
        // 1) busca de idempotência: nada emitido ainda
        .mockResolvedValueOnce(resposta({ object: "list", data: [] }))
        // 2) a cobrança
        .mockResolvedValueOnce(
          resposta({
            id: "pay_debito_290",
            status: "PENDING",
            invoiceUrl: "https://www.asaas.com/i/debito290",
          }),
        )
        // 3) o BR Code
        .mockResolvedValueOnce(resposta({ payload: "00020126…debito" }));

      const emitida = await new AsaasProvider().emitirCobrancaAvulsa(debito);

      expect(emitida.providerChargeId).toBe("pay_debito_290");
      expect(emitida.pixCopiaECola).toBe("00020126…debito");

      const [url, init] = fetchMock.mock.calls[1]!;
      expect(url).toBe("https://api-sandbox.asaas.com/v3/payments");
      const corpo = JSON.parse(init.body);
      expect(corpo.customer).toBe(debito.clienteId);
      expect(corpo.billingType).toBe("PIX");
      expect(corpo.value).toBe(13);
      // O ponto do método existir separado.
      expect(corpo.pixAutomaticAuthorizationId).toBeUndefined();
      // E nenhuma ida à autorização revogada.
      expect(
        fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/pix/automatic/authorizations"),
        ),
      ).toHaveLength(0);
    });

    it("falha ao buscar o BR Code não derruba a cobrança já criada", async () => {
      fetchMock
        .mockResolvedValueOnce(resposta({ object: "list", data: [] }))
        .mockResolvedValueOnce(
          resposta({
            id: "pay_debito_290",
            status: "PENDING",
            invoiceUrl: "https://www.asaas.com/i/debito290",
          }),
        )
        .mockResolvedValueOnce(resposta({ errors: [] }, 500));

      const emitida = await new AsaasProvider().emitirCobrancaAvulsa(debito);

      // A cobrança EXISTE no gateway neste ponto. Lançar aqui obrigaria a
      // próxima tentativa a reconciliar uma cobrança órfã — troca um QR
      // ausente por um problema pior. `invoiceUrl` é a saída de contingência.
      expect(emitida.providerChargeId).toBe("pay_debito_290");
      expect(emitida.pixCopiaECola).toBeUndefined();
      expect(emitida.urlPagamento).toBe("https://www.asaas.com/i/debito290");
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
      fetchMock
        .mockResolvedValueOnce(
          resposta({ id: "pay_1", status: statusAsaas, value: 137 }),
        )
        // Status que mapeia para `recusada` dispara a busca do motivo na
        // instrução (D35). Aqui o foco é o mapeamento de status, então a lista
        // volta vazia: sem motivo, sem ruído.
        .mockResolvedValue(resposta({ data: [] }));
      const r = await new AsaasProvider().consultarCobranca("pay_1");
      expect(r.status).toBe(esperado);
      // Decimal do gateway volta a inteiro na entrada do sistema.
      expect(r.valorCentavos).toBe(13700);
    });

    it("lê o motivo da INSTRUÇÃO, não da cobrança (D35)", async () => {
      /**
       * O defeito que este teste fixa: até o D35 o motivo era procurado em
       * `refusalReason`/`failureReason`/`pixTransaction.failureReason` do corpo
       * de `GET /payments/{id}` — três campos que o `PaymentGetResponseDTO` não
       * declara (e `pixTransaction` é `string`, não objeto). O dono do
       * `refusalReason` é `GET /pix/automatic/paymentInstructions/{id}`.
       *
       * Por isso a cobrança aqui vem SEM campo de motivo algum: se o adapter
       * voltasse a lê-lo do `payment`, não teria de onde tirar nada. E a URL é
       * asserida porque "o motivo chegou" e "o motivo veio do recurso certo"
       * são coisas diferentes — a segunda é a que estava quebrada.
       */
      fetchMock
        .mockResolvedValueOnce(
          resposta({ id: "pay_1", status: "OVERDUE", value: 390 }),
        )
        .mockResolvedValueOnce(
          resposta({
            id: "pi_1",
            status: "REFUSED",
            paymentId: "pay_1",
            refusalReason: "MAXIMUM_AMOUNT_EXCEEDED",
          }),
        );

      const r = await new AsaasProvider().consultarCobranca("pay_1", {
        providerInstructionId: "pi_1",
      });

      expect(r.motivoRecusa).toBe("MAXIMUM_AMOUNT_EXCEEDED");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]![0])).toBe(
        "https://api-sandbox.asaas.com/v3/pix/automatic/paymentInstructions/pi_1",
      );
    });

    it("código novo do gateway atravessa inteiro, sem union fechada", async () => {
      // O catálogo é ABERTO: o OpenAPI declara `refusalReason` como `string` sem
      // `enum` e a doc avisa que a lista cresce sem versionar. Um código que o
      // Iris nunca viu tem que chegar bruto ao ciclo — filtrar por lista
      // conhecida transformaria motivo novo em "sem motivo informado", que é o
      // diagnóstico ERRADO (aponta o teto do #286 como causa provável).
      fetchMock
        .mockResolvedValueOnce(
          resposta({ id: "pay_novo", status: "OVERDUE", value: 390 }),
        )
        .mockResolvedValueOnce(
          resposta({ refusalReason: "MOTIVO_QUE_AINDA_NAO_EXISTE" }),
        );

      const r = await new AsaasProvider().consultarCobranca("pay_novo", {
        providerInstructionId: "pi_novo",
      });
      expect(r.motivoRecusa).toBe("MOTIVO_QUE_AINDA_NAO_EXISTE");
    });

    it("sem id de instrução, acha a instrução recusada pelo id da cobrança", async () => {
      // Caminho da varredura de pendentes (`reprocessarEventosPendentes`), que
      // só tem o id da cobrança em mãos. `status=REFUSED` no filtro é o que
      // impede pegar uma instrução `SCHEDULED` (a política em vigor permite até
      // 3 tentativas, então várias instruções por cobrança é o caso normal).
      fetchMock
        .mockResolvedValueOnce(
          resposta({ id: "pay_2", status: "OVERDUE", value: 390 }),
        )
        .mockResolvedValueOnce(
          resposta({
            data: [{ id: "pi_2", refusalReason: "PAYMENT_OVERDUE" }],
          }),
        );

      const r = await new AsaasProvider().consultarCobranca("pay_2");

      expect(r.motivoRecusa).toBe("PAYMENT_OVERDUE");
      expect(String(fetchMock.mock.calls[1]![0])).toContain(
        "/pix/automatic/paymentInstructions?paymentId=pay_2&status=REFUSED",
      );
    });

    it("cobrança paga não gasta chamada procurando motivo", async () => {
      // Recusa não existe em cobrança liquidada. Sem esta guarda, todo webhook
      // de pagamento aprovado pagaria um GET extra para receber `null`.
      fetchMock.mockResolvedValueOnce(
        resposta({ id: "pay_ok", status: "RECEIVED", value: 137 }),
      );
      const r = await new AsaasProvider().consultarCobranca("pay_ok", {
        providerInstructionId: "pi_ok",
      });
      expect(r.motivoRecusa).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falha ao ler a instrução NÃO derruba a conciliação — degrada e avisa", async () => {
      // O motivo é enriquecimento; quem decide o destino do ciclo é o `status`,
      // que já veio. Deixar o 404 subir faria a conciliação inteira falhar por
      // causa do campo acessório, e o ciclo ficaria em `aguardando_pagamento`.
      // Mas o erro indica contrato quebrado, então NÃO é engolido em silêncio:
      // vai ao log com a tag `[billing-recusa]`.
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        fetchMock
          .mockResolvedValueOnce(
            resposta({ id: "pay_3", status: "OVERDUE", value: 390 }),
          )
          .mockResolvedValueOnce(resposta({ errors: [] }, 404));

        const r = await new AsaasProvider().consultarCobranca("pay_3", {
          providerInstructionId: "pi_3",
        });

        expect(r.status).toBe("recusada");
        expect(r.valorCentavos).toBe(39000);
        expect(r.motivoRecusa).toBeNull();
        expect(aviso).toHaveBeenCalledWith(
          "[billing-recusa] falha ao ler a instrução de pagamento",
          expect.objectContaining({ providerInstructionId: "pi_3" }),
        );
      } finally {
        aviso.mockRestore();
      }
    });

    it("devolve motivoRecusa null quando a instrução não traz motivo", async () => {
      // `null` é caso esperado, não exceção: é ele que dispara o diagnóstico
      // com hipóteses ranqueadas em `conciliarPagamentoDeCiclo`. Inventar um
      // motivo aqui seria o erro que a #286 existe para evitar.
      fetchMock
        .mockResolvedValueOnce(
          resposta({ id: "pay_4", status: "OVERDUE", value: 390 }),
        )
        .mockResolvedValueOnce(resposta({ id: "pi_4", status: "REFUSED" }));
      const r = await new AsaasProvider().consultarCobranca("pay_4", {
        providerInstructionId: "pi_4",
      });
      expect(r.motivoRecusa).toBeNull();
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
        /Provedor de pagamento desconhecido/,
      );
    });
  });

  describe("consultarCobrancaParaReuso (#310)", () => {
    /**
     * Roteador de `fetch` por URL. Escrito aqui e não derivado do adapter: se o
     * teste montasse as rotas a partir do módulo sob teste, trocar o endpoint
     * passaria verde.
     */
    function rotear(mapa: {
      payment?: { corpo: unknown; status?: number };
      /**
       * TODAS as instruções que a cobrança tem no gateway — não uma lista já
       * filtrada pelo teste. O roteador aplica `?status=` como o índice real
       * aplica, e sem `status` devolve tudo.
       *
       * Escrito assim de propósito: com listas pré-filtradas por chave, o
       * adapter que consultasse o índice SEM filtro receberia `[]` (a chave
       * vazia) e passaria verde, e o caso "instruções DONE/REFUSED não
       * bloqueiam" ficaria idêntico ao de lista vazia — ele não teria nenhuma
       * instrução DONE para não bloquear.
       */
      instrucoes?: Array<Record<string, unknown>>;
      /** Status HTTP do índice de instruções, para os casos de erro. */
      instrucoesStatus?: number;
      qr?: { corpo: unknown; status?: number };
    }) {
      fetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/pixQrCode")) {
          return resposta(mapa.qr?.corpo ?? {}, mapa.qr?.status ?? 200);
        }
        if (u.includes("/pix/automatic/paymentInstructions")) {
          const status = mapa.instrucoesStatus ?? 200;
          if (status >= 400) {
            // Dialeto real do Asaas para 4xx: `{errors:[{code, description}]}`.
            return resposta(
              { errors: [{ code: "invalid_payment", description: "no" }] },
              status,
            );
          }
          const filtro = new URL(u).searchParams.get("status");
          const todas = mapa.instrucoes ?? [];
          return resposta({
            data: filtro ? todas.filter((i) => i.status === filtro) : todas,
          });
        }
        if (u.includes("/payments/")) {
          return resposta(
            mapa.payment?.corpo ?? {},
            mapa.payment?.status ?? 200,
          );
        }
        throw new Error(`fetch inesperado: ${u}`);
      });
    }

    /** Mutação morta: restringir o reuso a PENDING. OVERDUE é o estado real
     * depois de esgotadas as retentativas, e é o caso central da #310. */
    it("OVERDUE não removida é reaproveitável, com copia-e-cola", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_1",
            status: "OVERDUE",
            deleted: false,
            value: 137,
            invoiceUrl: "https://asaas/i/1",
          },
        },
        qr: { corpo: { payload: "00020126-brcode-1" } },
      });

      const r = await new AsaasProvider().consultarCobrancaParaReuso("pay_1");

      expect(r).toEqual({
        reuso: "pagavel",
        valorCentavos: 13700,
        pagamento: {
          forma: "pix_copia_e_cola",
          brCode: "00020126-brcode-1",
          urlPagamento: "https://asaas/i/1",
        },
      });
    });

    /** Mutação morta: descartar o `value` da cobrança e deixar a tela somar os
     * ciclos por conta própria. Uma cobrança consolidada sobre 3 ciclos cobra o
     * total dela, não o de um ciclo — o número tem que vir do gateway.
     * O literal (411 ↔ 41100) é escrito aqui, nunca derivado do conversor. */
    it("valor da cobrança vem do gateway, em centavos", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_12",
            status: "OVERDUE",
            deleted: false,
            // Três ciclos consolidados: 137 × 3. O `value` do Asaas é decimal.
            value: 411,
            invoiceUrl: "https://asaas/i/12",
          },
        },
        qr: { corpo: { payload: "00020126-brcode-12" } },
      });

      const r = await new AsaasProvider().consultarCobrancaParaReuso("pay_12");

      expect(r).toMatchObject({ reuso: "pagavel", valorCentavos: 41100 });
    });

    /** Mutação morta: cair para `0` quando o gateway não manda `value` (é o que
     * `consultarCobranca` faz, e ali é inócuo). Aqui viraria "R$ 0,00" na tela
     * ao lado de um copia-e-cola de verdade. E não é `nao_encontrada`: a
     * cobrança segue viva, então ninguém pode emitir outra por cima. */
    it("cobrança pagável sem valor legível não é apresentada", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_13",
            status: "PENDING",
            deleted: false,
            invoiceUrl: "https://asaas/i/13",
          },
        },
        qr: { corpo: { payload: "00020126-brcode-13" } },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_13"),
      ).toEqual({ reuso: "morta", motivo: "valor_indeterminado" });
    });

    /** Mutação morta: decidir só pelo `status`. O Asaas NÃO tem status
     * "cancelada" — `deleted` é o único marcador de remoção, e uma cobrança
     * removida com status PENDING passaria como pagável. */
    it("cobrança removida (`deleted`) não é reaproveitável, mesmo PENDING", async () => {
      rotear({
        payment: { corpo: { id: "pay_2", status: "PENDING", deleted: true } },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_2"),
      ).toEqual({
        reuso: "morta",
        motivo: "removida",
      });
    });

    /** Mutação morta: classificar cobrança paga como pagável e reapresentar o
     * QR de uma dívida já quitada. */
    it("RECEIVED volta como paga, para o chamador liquidar o ciclo", async () => {
      rotear({
        payment: { corpo: { id: "pay_3", status: "RECEIVED", deleted: false } },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_3"),
      ).toEqual({
        reuso: "paga",
      });
    });

    /** Mutação morta: trocar a allow-list {PENDING,OVERDUE} por deny-list
     * (`status !== "REFUNDED"`). Todo status desconhecido passaria a pagável. */
    it("status fora da allow-list não é reaproveitável", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_4",
            status: "AWAITING_RISK_ANALYSIS",
            deleted: false,
          },
        },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_4"),
      ).toEqual({
        reuso: "morta",
        motivo: "status_nao_pagavel",
      });
    });

    /** Mutação morta: devolver `nao_encontrada` (o único motivo que libera
     * emitir outra cobrança) para status de cobrança terceirizada. `DUNNING_*`
     * segue pagável pelo pagador no trilho da recuperação — emitir a segunda
     * cobrança por cima é a cobrança dupla. O motivo tem que ser distinguível
     * do 404, e não pode ser confundido com "morreu". */
    it.each(["DUNNING_REQUESTED", "DUNNING_RECEIVED"])(
      "%s é cobrança terceirizada — não reaproveitável e não substituível",
      async (statusCru) => {
        rotear({
          payment: {
            corpo: {
              id: "pay_14",
              status: statusCru,
              deleted: false,
              value: 137,
              invoiceUrl: "https://asaas/i/14",
            },
          },
        });

        expect(
          await new AsaasProvider().consultarCobrancaParaReuso("pay_14"),
        ).toEqual({ reuso: "morta", motivo: "em_cobranca_terceirizada" });
      },
    );

    /** Mutação morta: herdar o `throw` de `estornada` no caminho novo (D-7).
     * Com o throw, o gate ficaria travado para sempre. */
    it("estorno é ramo explícito, não exceção", async () => {
      rotear({
        payment: { corpo: { id: "pay_5", status: "REFUNDED", deleted: false } },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_5"),
      ).toEqual({
        reuso: "morta",
        motivo: "estornada",
      });
    });

    /** Mutação morta: propagar o 404 e trancar a reativação por causa de um id
     * órfão que ninguém consegue pagar. */
    it("404 é cobrança morta, não indisponibilidade", async () => {
      rotear({
        payment: {
          corpo: { errors: [{ description: "not found" }] },
          status: 404,
        },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_6"),
      ).toEqual({
        reuso: "morta",
        motivo: "nao_encontrada",
      });
    });

    /** Mutação morta: tratar qualquer erro como "não encontrada". É o
     * degradar-em-silêncio do #157, e aqui o preço é cobrança dupla. */
    it("5xx SOBE — não vira cobrança morta", async () => {
      rotear({ payment: { corpo: { errors: [] }, status: 500 } });

      await expect(
        new AsaasProvider().consultarCobrancaParaReuso("pay_7"),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });

    /** Mutação morta: ignorar as instruções e devolver o copia-e-cola dentro da
     * janela crítica — pagamento em duplicidade. O "zero chamada a /pixQrCode"
     * mata também a variante que consulta e devolve o código assim mesmo. */
    it("instrução SCHEDULED bloqueia a apresentação, e nem busca o QR", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_8",
            status: "OVERDUE",
            deleted: false,
            value: 137,
            invoiceUrl: "https://asaas/i/8",
          },
        },
        instrucoes: [{ id: "ins_8", status: "SCHEDULED" }],
        qr: { corpo: { payload: "00020126-nao-deve-aparecer" } },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_8"),
      ).toEqual({
        reuso: "em_processamento",
      });
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes("/pixQrCode")),
      ).toHaveLength(0);
    });

    /** Mutação morta: tratar QUALQUER instrução como pendente — listar o índice
     * sem `?status=`, ou ignorar o filtro. A cobrança AQUI TEM instruções, duas,
     * ambas terminais; só não tem nenhuma pendente. Com a lista já filtrada por
     * chave que o caso usava antes, esta fixture era literalmente a de lista
     * vazia e o mutante passava verde. */
    it("instruções DONE/REFUSED existentes não bloqueiam a apresentação", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_9",
            status: "OVERDUE",
            deleted: false,
            value: 137,
            invoiceUrl: "https://asaas/i/9",
          },
        },
        instrucoes: [
          { id: "ins_9a", status: "DONE" },
          { id: "ins_9b", status: "REFUSED" },
        ],
        qr: { corpo: { payload: "00020126-brcode-9" } },
      });

      const r = await new AsaasProvider().consultarCobrancaParaReuso("pay_9");
      expect(r.reuso).toBe("pagavel");
    });

    /** Mutação morta: fazer 4xx da LISTAGEM de instruções subir. A cobrança de
     * débito que o gate emite é Pix comum, sem instrução de Pix Automático
     * nenhuma — este é o caminho mais comum, não uma borda. Com o throw, o gate
     * ia a `bloqueado/gateway_indisponivel` e a clínica lia "tente novamente em
     * alguns instantes" em TODA reentrada, para sempre. */
    it.each([404, 400])(
      "%i na listagem de instruções significa 'sem instrução', não indisponibilidade",
      async (statusHttp) => {
        rotear({
          payment: {
            corpo: {
              id: "pay_15",
              status: "OVERDUE",
              deleted: false,
              value: 137,
              invoiceUrl: "https://asaas/i/15",
            },
          },
          instrucoesStatus: statusHttp,
          qr: { corpo: { payload: "00020126-brcode-15" } },
        });

        expect(
          await new AsaasProvider().consultarCobrancaParaReuso("pay_15"),
        ).toEqual({
          reuso: "pagavel",
          valorCentavos: 13700,
          pagamento: {
            forma: "pix_copia_e_cola",
            brCode: "00020126-brcode-15",
            urlPagamento: "https://asaas/i/15",
          },
        });
      },
    );

    /** Mutação morta: engolir a falha da listagem e apresentar o código sem
     * saber se há débito automático a caminho. */
    it("falha ao listar instruções SOBE", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/pix/automatic/paymentInstructions")) {
          return resposta({ errors: [] }, 500);
        }
        return resposta({
          id: "pay_10",
          status: "OVERDUE",
          deleted: false,
          invoiceUrl: "https://a/10",
        });
      });

      await expect(
        new AsaasProvider().consultarCobrancaParaReuso("pay_10"),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });

    /** Mutação morta: devolver `pagavel` com QR vazio. A clínica acharia que
     * pagou o que não pagou — mesmo raciocínio de `formaDePagamento`. */
    it("sem link e sem copia-e-cola não é reaproveitável", async () => {
      rotear({
        payment: {
          corpo: {
            id: "pay_11",
            status: "PENDING",
            deleted: false,
            value: 137,
          },
        },
        qr: { corpo: {} },
      });

      expect(
        await new AsaasProvider().consultarCobrancaParaReuso("pay_11"),
      ).toEqual({
        reuso: "morta",
        motivo: "sem_forma_de_pagamento",
      });
    });
  });

  describe("comandarRetentativa (#322)", () => {
    /**
     * As CINCO mensagens são escritas aqui **literalmente**, copiadas da doc do
     * Asaas (registradas no comentário da #317), e nunca importadas de
     * `asaas.ts`. Derivá-las da tabela do módulo sob teste reproduziria o
     * defeito [teste-verde-que-nao-testa-nada]: o caso passaria contra qualquer
     * trecho, inclusive contra um que nunca casasse com a mensagem real.
     *
     * O Asaas **não publica código de erro dedicado** para estas validações — o
     * `code` é genérico e o que discrimina é a `description`. Por isso não há
     * (e não pode haver) asserção sobre um código inventado.
     */
    const MENSAGENS_DAS_CINCO_VALIDACOES = [
      [
        "Limite de retentativas excedido. A regra permite no máximo 3 tentativas.",
        "limite_de_tentativas",
      ],
      [
        "A data solicitada ultrapassa o limite de 7 dias corridos permitidos após o vencimento original.",
        "fora_da_janela_de_7_dias",
      ],
      [
        "O agendamento da retentativa deve ser enviado até as 23h59 do dia anterior à data desejada para liquidação.",
        "fora_do_horario_de_comando",
      ],
      [
        "A data da retentativa não pode coincidir ou ultrapassar o dia de início do próximo ciclo da recorrência.",
        "colide_com_proximo_ciclo",
      ],
      [
        "A autorização desta cobrança não permite retentativas extradia (Política N).",
        "autorizacao_sem_politica",
      ],
    ] as const;

    it("monta a URL do recurso de retentativa e manda só a dueDate", async () => {
      // "comandou" e "comandou no endereço certo" são coisas diferentes — e a
      // segunda é a que quebra em silêncio (o D35 é o precedente: três campos
      // lidos de um recurso que não os tem). A URL é do recurso RETRIES da
      // INSTRUÇÃO, não da cobrança.
      fetchMock.mockResolvedValueOnce(resposta({ id: "pi_1" }, 200));

      const r = await new AsaasProvider().comandarRetentativa(
        "pi_1",
        "2026-08-20",
      );

      expect(r).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]![0])).toBe(
        "https://api-sandbox.asaas.com/v3/pix/automatic/paymentInstructions/pi_1/retries",
      );
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe("POST");
      // Corpo EXATO: um campo a mais aqui é campo que o Asaas engole em silêncio
      // (medido na #321 com `maxLimitValue`), e um a menos é 400.
      expect(JSON.parse(String(init.body))).toEqual({ dueDate: "2026-08-20" });
    });

    it.each(MENSAGENS_DAS_CINCO_VALIDACOES)(
      "400 «%s» vira motivo fechado",
      async (descricao, motivoEsperado) => {
        fetchMock.mockResolvedValueOnce(
          resposta(
            { errors: [{ code: "invalid_action", description: descricao }] },
            400,
          ),
        );

        const r = await new AsaasProvider().comandarRetentativa(
          "pi_2",
          "2026-08-20",
        );

        expect(r).toEqual({
          ok: false,
          motivo: motivoEsperado,
          mensagemGateway: descricao,
        });
      },
    );

    it("400 de mensagem desconhecida cai em `desconhecido`, com o texto cru", async () => {
      // NUNCA inventar código de erro do gateway: uma sexta validação (ou uma
      // reescrita de frase do lado deles) tem que aparecer no relatório, não ser
      // classificada por semelhança como uma das cinco.
      fetchMock.mockResolvedValueOnce(
        resposta(
          {
            errors: [
              {
                code: "invalid_object",
                description: "Validação nova que o Iris nunca viu.",
              },
            ],
          },
          400,
        ),
      );

      expect(
        await new AsaasProvider().comandarRetentativa("pi_3", "2026-08-20"),
      ).toEqual({
        ok: false,
        motivo: "desconhecido",
        mensagemGateway: "Validação nova que o Iris nunca viu.",
      });
    });

    it("500 SOBE — indisponibilidade não é recusa", async () => {
      // "não consegui perguntar" virando "o gateway recusou" faria a varredura
      // gravar desfecho definitivo sobre pergunta não respondida — e o comando
      // pode ter sido aceito do outro lado. Mesma disciplina de
      // `consultarCobrancaParaReuso`.
      fetchMock.mockResolvedValueOnce(resposta({ errors: [] }, 500));

      await expect(
        new AsaasProvider().comandarRetentativa("pi_4", "2026-08-20"),
      ).rejects.toBeInstanceOf(BillingProviderError);
    });

    it("erro de rede SOBE cru, sem virar BillingProviderError", async () => {
      // A distinção existe para o chamador decidir retry: 4xx é definitivo,
      // timeout/DNS é transitório. Embrulhar aqui apagaria a diferença.
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(
        new AsaasProvider().comandarRetentativa("pi_5", "2026-08-20"),
      ).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe("instrucaoParaRetentativa (#322)", () => {
    /**
     * Roteador do índice de instruções, no mesmo idioma do de
     * `consultarCobrancaParaReuso`: recebe TODAS as instruções da cobrança e
     * aplica o `?status=` como o índice real aplica.
     *
     * Listas já filtradas pelo teste seriam o dublê escrevendo o predicado do
     * código sob teste: um adapter que consultasse o status ERRADO receberia a
     * mesma lista e passaria verde.
     */
    function rotearInstrucoes(todas: Array<Record<string, unknown>>): void {
      fetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (!u.includes("/pix/automatic/paymentInstructions")) {
          throw new Error(`fetch inesperado: ${u}`);
        }
        const filtro = new URL(u).searchParams.get("status");
        return resposta({
          data: filtro ? todas.filter((i) => i.status === filtro) : todas,
        });
      });
    }

    it("instrução SCHEDULED é `pendente`, e a listagem das RECUSADAS não acontece", async () => {
      rotearInstrucoes([{ id: "pi_8", status: "SCHEDULED" }]);

      expect(
        await new AsaasProvider().instrucaoParaRetentativa("pay_9"),
      ).toEqual({ providerInstructionId: null, pendente: true });

      // A ORDEM é o que o docblock promete, e ela só é observável na contagem:
      // havendo instrução a caminho, o id da recusada é irrelevante e a
      // consulta a `status=REFUSED` seria round-trip desperdiçado dentro do
      // orçamento de 30s do job. As URLs são escritas à mão — derivá-las do
      // adapter faria trocar o endpoint passar verde.
      //
      // São DUAS, e não uma: "instrução a caminho" é `AWAITING_REQUEST` **ou**
      // `SCHEDULED`, e o índice do Asaas filtra um `status` por consulta. A
      // terceira chamada — a das recusadas — é a que não pode existir.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
        "https://api-sandbox.asaas.com/v3/pix/automatic/paymentInstructions?paymentId=pay_9&status=AWAITING_REQUEST",
        "https://api-sandbox.asaas.com/v3/pix/automatic/paymentInstructions?paymentId=pay_9&status=SCHEDULED",
      ]);
    });

    it("sem instrução a caminho, devolve o id da RECUSADA", async () => {
      rotearInstrucoes([
        { id: "pi_9", status: "REFUSED", dateCreated: "2026-08-10 09:00:00" },
      ]);

      expect(
        await new AsaasProvider().instrucaoParaRetentativa("pay_9"),
      ).toEqual({ providerInstructionId: "pi_9", pendente: false });

      // As duas do pendente + a das recusadas.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("cobrança sem pendente e sem recusada devolve `null` SEM lançar", async () => {
      // A instrução `DONE` está aqui de propósito: o índice não está vazio, e
      // mesmo assim não há nada a retentar. Devolver o id dela seria comandar
      // retentativa sobre uma instrução que já liquidou.
      rotearInstrucoes([{ id: "pi_10", status: "DONE" }]);

      expect(
        await new AsaasProvider().instrucaoParaRetentativa("pay_9"),
      ).toEqual({ providerInstructionId: null, pendente: false });
    });
  });
});
