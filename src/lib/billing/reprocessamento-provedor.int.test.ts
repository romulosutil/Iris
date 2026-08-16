import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { authDb } = await import("@/db/client");
const { reprocessarEventosPendentes } = await import("./subscription");

/**
 * Varredura de pendentes do Asaas (#36).
 *
 * `reprocessarEventosPendentes()` varre a tabela `asaas_webhook_event` para
 * aplicar eventos de webhook que não foram processados ou falharam.
 */

const TOKEN_ASAAS = "token-de-teste-do-asaas-36";
const API_KEY_ASAAS = "chave-api-de-teste-do-asaas-36";
const BASE_URL_ASAAS = "https://api-sandbox.asaas.com/v3";

/**
 * `iris_auth` não tem DELETE nas tabelas de webhook (trilha não é apagável pelo
 * app), então a limpeza usa a role DONA — igual aos demais .int.test.ts do repo.
 */
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/** Clínicas criadas no arquivo, para limpar no final sem varrer a tabela. */
const clinicasCriadas: string[] = [];

/** Id de evento no formato real do sandbox do Asaas: `evt_<hex32>&<inteiro>`. */
function novoIdEventoAsaas(): string {
  return `evt_${randomBytes(16).toString("hex")}&${Math.floor(1e7 + Math.random() * 8e7)}`;
}

async function novaClinica(): Promise<string> {
  const linhas = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica teste reproc ${crypto.randomUUID()}`})
    RETURNING id`;
  const id = linhas[0]!.id as string;
  clinicasCriadas.push(id);
  return id;
}

async function novaAssinatura(opcoes: {
  providerSubscriptionId: string;
  provider: string;
}): Promise<string> {
  const clinicId = await novaClinica();
  await owner!`
    INSERT INTO subscription
      (clinic_id, status, provider, provider_subscription_id, ciclo_dias)
    VALUES (
      ${clinicId}, 'setup_pending'::subscription_status,
      ${opcoes.provider}, ${opcoes.providerSubscriptionId}, 30
    )`;
  return clinicId;
}

/** Envelope de autorização do Asaas, na forma medida no sandbox. */
function payloadAsaas(idEvento: string, authorizationId: string) {
  return {
    id: idEvento,
    event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
    dateCreated: "2026-08-08 19:55:12",
    authorization: {
      id: authorizationId,
      status: "ACTIVE",
      frequency: "MONTHLY",
      customerId: "cus_000008561913",
    },
  };
}

async function semearAsaasPendente(
  authorizationId: string,
  payload?: unknown,
): Promise<string> {
  const idEvento = novoIdEventoAsaas();
  const corpo = payload ?? payloadAsaas(idEvento, authorizationId);
  await owner!`
    INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
    VALUES (${idEvento}, 'PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED',
            ${owner!.json(corpo as never)})`;
  return idEvento;
}

/**
 * Ciclo já apurado e com cobrança emitida — o estado em que o webhook de
 * pagamento encontra o ciclo em produção. Espelha `novoCiclo` de
 * `src/app/api/hooks/asaas/route.int.test.ts` (mesma tabela, mesmo caminho).
 */
async function novoCicloAsaas(opcoes: {
  providerChargeId: string;
}): Promise<{ clinicId: string; cicloId: string }> {
  const clinicId = await novaClinica();
  const assinaturas = await owner!`
    INSERT INTO subscription
      (clinic_id, status, provider, provider_subscription_id, ciclo_dias)
    VALUES (
      ${clinicId}, 'active'::subscription_status, 'asaas',
      ${`auth-do-ciclo-${crypto.randomUUID()}`}, 30
    )
    RETURNING id`;
  const subscriptionId = assinaturas[0]!.id as string;
  const ciclos = await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status,
       pacientes_contados, valor_centavos, apurado_em, provider_charge_id,
       cobranca_emitida_em)
    VALUES (
      ${clinicId}, ${subscriptionId},
      now() - interval '30 days', now(),
      'aguardando_pagamento'::billing_cycle_status,
      3, 11700, now(), ${opcoes.providerChargeId}, now()
    )
    RETURNING id`;
  return { clinicId, cicloId: ciclos[0]!.id as string };
}

/** Envelope de evento de COBRANÇA nossa (`externalReference = cycle:<id>`). */
function payloadCobrancaAsaas(
  idEvento: string,
  paymentId: string,
  cicloId: string,
  opcoes: { event?: string; status?: string } = {},
) {
  return {
    id: idEvento,
    event: opcoes.event ?? "PAYMENT_OVERDUE",
    dateCreated: "2026-08-08 20:01:00",
    payment: {
      id: paymentId,
      status: opcoes.status ?? "OVERDUE",
      value: 117,
      billingType: "PIX",
      externalReference: `cycle:${cicloId}`,
      dateCreated: "2026-08-08",
    },
  };
}

async function semearCobrancaPendente(
  paymentId: string,
  cicloId: string,
  opcoes: { event?: string; status?: string } = {},
): Promise<string> {
  const idEvento = novoIdEventoAsaas();
  const corpo = payloadCobrancaAsaas(idEvento, paymentId, cicloId, opcoes);
  await owner!`
    INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
    VALUES (${idEvento}, ${corpo.event}, ${owner!.json(corpo as never)})`;
  return idEvento;
}

/**
 * Evento de INSTRUÇÃO recusada — a forma real do `INSTRUCTION_REFUSED`: chega
 * SEM `payment.status`, só com `paymentInstruction.status` (#286).
 */
async function semearInstrucaoRecusadaPendente(
  paymentId: string,
  cicloId: string,
): Promise<string> {
  const idEvento = novoIdEventoAsaas();
  const corpo = {
    id: idEvento,
    event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
    dateCreated: "2026-08-08 21:30:00",
    payment: { id: paymentId, externalReference: `cycle:${cicloId}` },
    paymentInstruction: {
      id: "pi_reproc",
      paymentId,
      status: "REFUSED",
      authorization: { id: "auth-da-instrucao-recusada" },
    },
  };
  await owner!`
    INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
    VALUES (${idEvento}, ${corpo.event}, ${owner!.json(corpo as never)})`;
  return idEvento;
}

async function lerCicloAsaas(
  cicloId: string,
): Promise<{ status: string; erro: string | null }> {
  const r = await authDb.execute(
    sql`SELECT status::text AS status, erro FROM billing_cycle
        WHERE id = ${cicloId}::uuid`,
  );
  return (r as unknown as { status: string; erro: string | null }[])[0]!;
}

// ── Leitura (sempre por `authDb`, a role da aplicação) ───────────────────────

async function lerAsaas(idEvento: string) {
  const r = await authDb.execute(
    sql`SELECT aplicado_em, erro_aplicacao FROM asaas_webhook_event
        WHERE asaas_event_id = ${idEvento}`,
  );
  return (
    r as unknown as { aplicado_em: unknown; erro_aplicacao: string | null }[]
  )[0]!;
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

/** Fila de respostas do `fetch`. Cada chamada consome uma. */
let respostasGateway: Array<() => Promise<Response>> = [];
let chamadasGateway: string[] = [];

let rotasGateway: Array<{
  casa: (url: string) => boolean;
  responde: () => Promise<Response>;
}> = [];

/** `GET /pix/automatic/authorizations/{id}` do Asaas. */
function respondeAutorizacaoAsaas(status = "ACTIVE") {
  respostasGateway.push(async () =>
    Response.json({ id: "auth-dublê", status, value: null }),
  );
}

/** `GET /payments/{id}` do Asaas. `extra` mescla campos crus no corpo.
 *
 * ⚠️ Sem campo de motivo de recusa, e isso é o contrato: o
 * `PaymentGetResponseDTO` não declara `refusalReason` (D35). O motivo é da
 * INSTRUÇÃO — ver `respondeInstrucoesAsaas`. */
function respondeCobrancaAsaas(
  status: string,
  valorReais = 117,
  extra: Record<string, unknown> = {},
) {
  respostasGateway.push(async () =>
    Response.json({ id: "pay-dublê", status, value: valorReais, ...extra }),
  );
}

/**
 * `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`.
 *
 * É por aqui que a VARREDURA acha o motivo: diferente do webhook, ela só tem o
 * id da cobrança em mãos — o id da instrução não sobrevive à ida ao banco.
 * Códigos são os reais do catálogo do Asaas, em inglês.
 */
function respondeInstrucoesAsaas(itens: Array<Record<string, unknown>>) {
  respostasGateway.push(async () => Response.json({ data: itens }));
}

function respondeHttp(status: number, corpo: unknown = { errors: [] }) {
  respostasGateway.push(async () => Response.json(corpo, { status }));
}

function respondeErroDeRede(mensagem: string) {
  respostasGateway.push(async () => {
    throw new Error(mensagem);
  });
}

describe.skipIf(!hasDb)("reprocessarEventosPendentes", () => {
  beforeAll(() => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN_ASAAS);
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY_ASAAS);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL_ASAAS);
  });

  beforeEach(async () => {
    respostasGateway = [];
    chamadasGateway = [];
    rotasGateway = [];
    vi.stubGlobal("fetch", async (entrada: unknown) => {
      const url = String(entrada);
      chamadasGateway.push(url);
      const rota = rotasGateway.find((r) => r.casa(url));
      if (rota) return rota.responde();
      const proxima = respostasGateway.shift();
      if (!proxima) {
        throw new Error(
          `fetch inesperado para ${String(entrada)} — nenhuma resposta de gateway foi enfileirada neste teste`,
        );
      }
      return proxima();
    });

    await owner!`TRUNCATE billing_cycle, subscription, asaas_webhook_event
                 RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await owner`TRUNCATE billing_cycle, subscription, asaas_webhook_event
                  RESTART IDENTITY CASCADE`;
      if (clinicasCriadas.length > 0) {
        await owner`DELETE FROM clinic WHERE id = ANY(${clinicasCriadas}::uuid[])`;
      }
      await owner.end();
    }
    vi.unstubAllEnvs();
  });

  describe("BILLING_PROVIDER=asaas", () => {
    beforeEach(() => {
      vi.stubEnv("BILLING_PROVIDER", "asaas");
    });

    it("seleciona e aplica o evento pendente de `asaas_webhook_event`", async () => {
      const authId = "53da5204-8dd1-4cf4-9604-d134e1e6fe04";
      await novaAssinatura({
        providerSubscriptionId: authId,
        provider: "asaas",
      });
      const idEvento = await semearAsaasPendente(authId);
      respondeAutorizacaoAsaas("ACTIVE");

      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toBeNull();

      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(
        `${BASE_URL_ASAAS}/pix/automatic/authorizations/${authId}`,
      );
    });

    it("evento Asaas sem id utilizável carimba 'evento sem id utilizável' (não fica na fila para sempre)", async () => {
      const idEvento = novoIdEventoAsaas();
      await owner!`
        INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
        VALUES (${idEvento}, 'PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED',
                ${owner!.json({
                  id: idEvento,
                  event: "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
                  account: { id: "conta-x" },
                } as never)})`;

      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 0, falhas: 0 });
      expect(chamadasGateway).toHaveLength(0);

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      // Texto UNIFICADO com o da rota na #289: a varredura gravava
      // `"sem id utilizável"` e a rota `"evento sem id utilizável"` — duas
      // cópias do mesmo desfecho que já tinham derivado.
      expect(depois.erro_aplicacao).toBe("evento sem id utilizável");
    });

    it("404 do Asaas é DEFINITIVO: carimba aplicado_em e a linha não volta", async () => {
      const authId = "auth-inexistente";
      await novaAssinatura({
        providerSubscriptionId: authId,
        provider: "asaas",
      });
      const idEvento = await semearAsaasPendente(authId);

      respondeHttp(404, {
        errors: [{ code: "invalid_action", description: "not found" }],
      });
      const primeira = await reprocessarEventosPendentes();
      expect(primeira).toEqual({ aplicados: 0, falhas: 1 });

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toContain("404");

      const antes = chamadasGateway.length;
      const segunda = await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(antes);
      expect(segunda).toEqual({ aplicados: 0, falhas: 0 });
    });

    it.each([429, 500])(
      "%i do Asaas é TRANSITÓRIO: continua pendente e VOLTA na varredura seguinte",
      async (status) => {
        const authId = `auth-${status}`;
        await novaAssinatura({
          providerSubscriptionId: authId,
          provider: "asaas",
        });
        const idEvento = await semearAsaasPendente(authId);

        respondeHttp(status);
        await reprocessarEventosPendentes();
        expect((await lerAsaas(idEvento)).aplicado_em).toBeNull();

        const antes = chamadasGateway.length;
        respondeHttp(status);
        const segunda = await reprocessarEventosPendentes();
        expect(chamadasGateway.length).toBe(antes + 1);
        expect(segunda).toEqual({ aplicados: 0, falhas: 1 });

        const depois = await lerAsaas(idEvento);
        expect(depois.aplicado_em).toBeNull();
        expect(depois.erro_aplicacao).toContain(String(status));
      },
    );

    it("erro de rede continua pendente e VOLTA na varredura seguinte", async () => {
      const authId = "auth-rede";
      await novaAssinatura({
        providerSubscriptionId: authId,
        provider: "asaas",
      });
      const idEvento = await semearAsaasPendente(authId);

      respondeErroDeRede("ECONNRESET simulado no dublê do gateway");
      await reprocessarEventosPendentes();
      expect((await lerAsaas(idEvento)).aplicado_em).toBeNull();

      const antes = chamadasGateway.length;
      respondeAutorizacaoAsaas("ACTIVE");
      const segunda = await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(antes + 1);
      expect(segunda).toEqual({ aplicados: 1, falhas: 0 });
      expect((await lerAsaas(idEvento)).aplicado_em).not.toBeNull();
    });

    it("conciliação falha na varredura: MANTÉM o motivo classificado em vez de apagá-lo (#289)", async () => {
      /**
       * O gêmeo defeituoso da rota. A varredura chamava
       * `conciliarPagamentoDeCiclo` **descartando o retorno** e carimbava
       * `erro_aplicacao = null` em todo evento que não estourasse exceção.
       * Efeito: reprocessar um evento cuja cobrança de ciclo não achou ciclo
       * APAGAVA o motivo — curava o sintoma (a linha sai da fila) e matava o
       * sinal. E como esta varredura é justamente o caminho que roda quando a
       * entrega ao vivo falhou, o alarme sumia no cenário em que ele importa.
       *
       * O evento entra com um motivo já gravado por uma tentativa anterior,
       * para que "apagou" e "nunca escreveu" sejam distinguíveis: a asserção
       * final vale contra os dois defeitos.
       */
      const paymentId = `pay-orfa-${crypto.randomUUID()}`;
      // Ciclo que NÃO existe: a referência é nossa, mas nenhum
      // `billing_cycle.provider_charge_id` casa.
      const cicloInexistente = crypto.randomUUID();
      const idEvento = await semearCobrancaPendente(
        paymentId,
        cicloInexistente,
        { event: "PAYMENT_RECEIVED", status: "RECEIVED" },
      );
      await owner!`
        UPDATE asaas_webhook_event
        SET erro_aplicacao = 'cobrança de ciclo sem ciclo correspondente'
        WHERE asaas_event_id = ${idEvento}`;

      respondeCobrancaAsaas("RECEIVED");

      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      // Literal, e não a constante importada: o teste tem que travar o texto,
      // não concordar com ele.
      expect(depois.erro_aplicacao).toBe(
        "cobrança de ciclo sem ciclo correspondente",
      );
    });

    it("ativação sem externalReference reprocessada NÃO vira alarme (mesma classificação da rota)", async () => {
      /**
       * A outra metade do D-4: a varredura tem que gravar o MESMO motivo que a
       * rota gravaria, e não um texto próprio. Uma cobrança sem referência é a
       * ativação — desfecho esperado, nunca alarme, nos dois caminhos.
       */
      const paymentId = `pay-ativacao-${crypto.randomUUID()}`;
      const idEvento = novoIdEventoAsaas();
      await owner!`
        INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
        VALUES (${idEvento}, 'PAYMENT_RECEIVED',
                ${owner!.json({
                  id: idEvento,
                  event: "PAYMENT_RECEIVED",
                  dateCreated: "2026-08-08 20:01:00",
                  payment: {
                    id: paymentId,
                    status: "RECEIVED",
                    value: 1,
                    billingType: "PIX",
                  },
                } as never)})`;

      respondeCobrancaAsaas("RECEIVED");

      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toBe(
        "cobrança fora do ciclo (ativação ou avulsa)",
      );
    });

    it("evento de cobrança recusada pendente repassa o motivo do gateway ao ciclo (#286)", async () => {
      /**
       * `reprocessarEventosPendentes` é o GÊMEO de `route.ts`: é a varredura,
       * e não o webhook ao vivo, que aplica o evento quando a entrega original
       * falhou ou chegou fora de ordem. `atual.motivoRecusa` (linha que
       * repassa o motivo para `conciliarPagamentoDeCiclo`) é código tão novo
       * quanto o do webhook, e sem um caso aqui o repasse fica sem cobertura
       * neste caminho — um motivo explícito do gateway seria silenciosamente
       * substituído pela hipótese do teto, invertendo a orientação dada ao
       * cliente.
       *
       * D35: a varredura não tem o id da instrução (ela lê o evento do banco e
       * chama `consultarCobranca` só com o id da cobrança), então o motivo vem
       * pelo índice `paymentId` + `status=REFUSED`. O dublê da cobrança segue
       * SEM campo de motivo, como a produção — se o adapter voltasse a lê-lo do
       * `payment`, este teste ficaria vermelho.
       */
      const paymentId = `pay-reproc-${crypto.randomUUID()}`;
      const { cicloId } = await novoCicloAsaas({ providerChargeId: paymentId });
      const idEvento = await semearCobrancaPendente(paymentId, cicloId);

      respondeCobrancaAsaas("OVERDUE");
      respondeInstrucoesAsaas([
        { id: "pi-reproc-recusada", refusalReason: "PAYMENT_OVERDUE" },
      ]);

      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });

      expect((await lerAsaas(idEvento)).aplicado_em).not.toBeNull();

      expect(chamadasGateway[1]).toContain(
        `/pix/automatic/paymentInstructions?paymentId=${paymentId}&status=REFUSED`,
      );

      const ciclo = await lerCicloAsaas(cicloId);
      expect(ciclo.status).toBe("falhou");
      expect(ciclo.erro).toContain("PAYMENT_OVERDUE");
    });

    it("recusa de instrução que a reconsulta desmente deixa rastro também na varredura (#286)", async () => {
      /**
       * Gêmeo do caso da rota. A varredura é justamente o caminho que roda
       * quando a entrega ao vivo falhou — ou seja, o cenário em que um guard
       * que existisse só em `route.ts` sumiria por completo. Se a suposição
       * `INSTRUCTION_REFUSED → OVERDUE` estiver errada, aqui também nada é
       * gravado e o evento sai da fila carimbado como aplicado: o log é o
       * único rastro.
       */
      const paymentId = `pay-reproc-mudo-${crypto.randomUUID()}`;
      const { cicloId } = await novoCicloAsaas({ providerChargeId: paymentId });
      const idEvento = await semearInstrucaoRecusadaPendente(
        paymentId,
        cicloId,
      );

      // O gateway discorda do evento: para ele a cobrança segue viva.
      respondeCobrancaAsaas("PENDING");

      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const r = await reprocessarEventosPendentes();
        expect(r).toEqual({ aplicados: 1, falhas: 0 });

        expect((await lerAsaas(idEvento)).aplicado_em).not.toBeNull();
        expect((await lerCicloAsaas(cicloId)).status).toBe(
          "aguardando_pagamento",
        );

        expect(aviso).toHaveBeenCalledWith(
          "[billing-recusa] evento de recusa NÃO virou recusa na reconsulta (#286)",
          expect.objectContaining({
            providerChargeId: paymentId,
            tipoEvento: "cobranca.recusada",
            statusReconsultado: "pendente",
          }),
        );
      } finally {
        aviso.mockRestore();
      }
    });
  });
});
