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
const { POST } = await import("./route");

/**
 * Webhook do Asaas (#36, Fase 7 — Pix Automático).
 *
 * Este arquivo é `.int.test.ts` (roda em `pnpm test:rls`, não em `pnpm test`)
 * porque as duas garantias centrais do endpoint são do BANCO, não do código:
 *
 * 1. Idempotência é o `UNIQUE (asaas_event_id)` decidindo a corrida entre duas
 *    entregas simultâneas. Um mock de `authDb` passaria verde com um
 *    SELECT-then-INSERT nu, que é exatamente o bug que a dedup evita.
 * 2. Desde 08/08/2026 a rota **aplica o efeito** (antes só registrava), e o
 *    efeito é UPDATE em `subscription`/`billing_cycle` sob os grants de
 *    `iris_auth`. Um grant faltando é invisível fora do Postgres real.
 *
 * ## Como o gateway foi dublado
 *
 * `AsaasProvider` fala com o Asaas por `fetch` NATIVO — então o dublê é
 * `vi.stubGlobal("fetch", …)` e só ele. Nada do módulo sob teste é mockado: a
 * verificação do token, o `normalizarEvento` e os mapeamentos de status rodam
 * de verdade. Um `vi.mock` do provider inteiro trocaria justamente o que este
 * arquivo precisa provar por um dublê que sempre concorda.
 *
 * ## Ids de evento
 *
 * No formato REAL do sandbox (`evt_<hex32>&<inteiro>` — o `&` é literal), medido
 * em `docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`. Usar um id
 * "bonitinho" esconderia qualquer lugar que trate o id como parte de URL ou de
 * query string.
 */

// Token de teste fixado aqui e não no .env: o `.env` é gitignored, e um teste
// de autenticação que depende de segredo invisível no review vira verde por
// omissão quando a var some.
const TOKEN = "token-de-teste-do-asaas-36";
const API_KEY = "chave-api-de-teste-do-asaas-36";
const BASE_URL = "https://api-sandbox.asaas.com/v3";

/**
 * `iris_auth` só tem GRANT de SELECT/INSERT/UPDATE em `asaas_webhook_event`
 * (nunca DELETE — trilha de webhook não é apagável pelo app), então a limpeza
 * usa a role DONA, igual aos demais .int.test.ts do repo.
 *
 * `max: 2` (e não `max: 1`): o teste de corrida mantém UMA transação aberta e,
 * ao mesmo tempo, precisa consultar o catálogo para saber se o handler já
 * bloqueou. Com pool de 1 a consulta fica presa atrás da própria transação e o
 * teste estoura por timeout, não por falha real.
 */
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/** Clínicas criadas no arquivo, para limpar no final sem varrer a tabela. */
const clinicasCriadas: string[] = [];

/** Id de evento no formato real do sandbox: `evt_<hex32>&<inteiro>`. */
function novoIdEvento(): string {
  return `evt_${randomBytes(16).toString("hex")}&${Math.floor(1e7 + Math.random() * 8e7)}`;
}

async function novaClinica(): Promise<string> {
  const linhas = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica teste Asaas ${crypto.randomUUID()}`})
    RETURNING id`;
  const id = linhas[0]!.id as string;
  clinicasCriadas.push(id);
  return id;
}

async function novaAssinatura(opcoes: {
  providerSubscriptionId: string;
  status?: string;
  cicloDias?: number;
}): Promise<{ clinicId: string; subscriptionId: string }> {
  const clinicId = await novaClinica();
  const linhas = await owner!`
    INSERT INTO subscription
      (clinic_id, status, provider, provider_subscription_id, ciclo_dias)
    VALUES (
      ${clinicId},
      ${opcoes.status ?? "setup_pending"}::subscription_status,
      'asaas',
      ${opcoes.providerSubscriptionId},
      ${opcoes.cicloDias ?? 30}
    )
    RETURNING id`;
  return { clinicId, subscriptionId: linhas[0]!.id as string };
}

/**
 * Ciclo já apurado e com cobrança emitida — é o estado em que o webhook de
 * pagamento encontra o ciclo em produção. `provider_charge_id` é a ÚNICA
 * ligação entre a cobrança do Asaas e o ciclo (ver `conciliarPagamentoDeCiclo`).
 */
async function novoCiclo(opcoes: {
  providerChargeId: string;
}): Promise<{ clinicId: string; cicloId: string }> {
  const { clinicId, subscriptionId } = await novaAssinatura({
    providerSubscriptionId: `auth-do-ciclo-${crypto.randomUUID()}`,
    status: "active",
  });
  const linhas = await owner!`
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
  return { clinicId, cicloId: linhas[0]!.id as string };
}

// ── Requisição ───────────────────────────────────────────────────────────────

function requisicao(opcoes: {
  token?: string | null;
  corpo?: unknown;
  corpoCru?: string;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opcoes.token !== null && opcoes.token !== undefined) {
    headers.set("asaas-access-token", opcoes.token);
  }
  return new Request("https://irisclinica.ia.br/api/hooks/asaas", {
    method: "POST",
    headers,
    body: opcoes.corpoCru ?? JSON.stringify(opcoes.corpo ?? {}),
  });
}

// ── Consultas de verificação ─────────────────────────────────────────────────

async function contarLinhas(asaasEventId: string): Promise<number> {
  const r = await authDb.execute(
    sql`SELECT count(*)::int AS n FROM asaas_webhook_event
        WHERE asaas_event_id = ${asaasEventId}`,
  );
  return (r as unknown as { n: number }[])[0]!.n;
}

async function lerEvento(asaasEventId: string) {
  const r = await authDb.execute(
    sql`SELECT aplicado_em, erro_aplicacao, evento, payload
        FROM asaas_webhook_event WHERE asaas_event_id = ${asaasEventId}`,
  );
  return (
    r as unknown as {
      aplicado_em: unknown;
      erro_aplicacao: string | null;
      evento: string;
      payload: Record<string, unknown>;
    }[]
  )[0];
}

async function lerAssinatura(providerSubscriptionId: string) {
  const r = await authDb.execute(
    sql`SELECT status::text AS status, ativada_em, past_due_desde,
               ciclo_atual_inicio, ciclo_atual_fim
        FROM subscription WHERE provider_subscription_id = ${providerSubscriptionId}`,
  );
  // Timestamps voltam CRUS de `execute` (texto do driver, não `Date`) — as
  // asserções são sobre o valor cru, sem conversão. Normalizar antes de comparar
  // é justamente como um teste deixa de testar.
  return (
    r as unknown as {
      status: string;
      ativada_em: unknown;
      past_due_desde: unknown;
      ciclo_atual_inicio: unknown;
      ciclo_atual_fim: unknown;
    }[]
  )[0]!;
}

async function lerCiclo(cicloId: string) {
  const r = await authDb.execute(
    sql`SELECT status::text AS status, cobrado_em, erro
        FROM billing_cycle WHERE id = ${cicloId}::uuid`,
  );
  return (
    r as unknown as {
      status: string;
      cobrado_em: unknown;
      erro: string | null;
    }[]
  )[0]!;
}

/**
 * Espera até que ALGUMA sessão esteja bloqueada esperando lock em
 * `asaas_webhook_event`. Substitui um `sleep` arbitrário: o teste só segue
 * quando o fato que ele precisa (handler bloqueado) é observável no catálogo.
 */
async function esperaBloqueio(): Promise<void> {
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    // O INSERT concorrente espera no lock da TRANSAÇÃO que segura a tupla
    // (`transactionid`/`tuple`), não num lock de relação — por isso o filtro é
    // por `wait_event_type`, e não por `pg_locks.relation` (que é NULL nesses).
    const r = await owner!`
      SELECT count(*)::int AS n
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%asaas_webhook_event%'`;
    if (r[0]!.n > 0) return;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(
    "handler nunca bloqueou — a corrida não foi exercida, o teste seria vácuo",
  );
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

/** Fila de respostas do `fetch` para a API do Asaas. Cada chamada consome uma. */
let respostasGateway: Array<() => Promise<Response>> = [];
let chamadasGateway: string[] = [];

/** `GET /pix/automatic/authorizations/{id}` — status da autorização. */
function respondeAutorizacao(status: string) {
  respostasGateway.push(async () =>
    Response.json({ id: "auth-dublê", status, value: null }),
  );
}

/**
 * `GET /payments/{id}` — status e valor (decimal em reais) da cobrança.
 * `extra` mescla campos crus no corpo — usado para simular um gateway que
 * informa `refusalReason` (o caso SEM motivo, sem `extra`, é o medido em
 * produção em 13/08/2026; ver comentário em `asaas.ts:consultarCobranca`).
 */
function respondeCobranca(
  status: string,
  valorReais = 117,
  extra: Record<string, unknown> = {},
) {
  respostasGateway.push(async () =>
    Response.json({ id: "pay-dublê", status, value: valorReais, ...extra }),
  );
}

/** Resposta HTTP de erro (vira `BillingProviderError` com `status`). */
function respondeHttp(status: number, corpo: unknown = { errors: [] }) {
  respostasGateway.push(async () => Response.json(corpo, { status }));
}

// ── Payloads ─────────────────────────────────────────────────────────────────

/** Envelope de autorização de Pix Automático, na forma medida no sandbox. */
function eventoAutorizacao(
  id: string,
  authorizationId: string,
  opcoes: { event?: string; status?: string } = {},
) {
  return {
    id,
    event: opcoes.event ?? "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
    account: { id: "6d82d82e-324c-4eb1-a345-74421d2a501c", ownerId: null },
    dateCreated: "2026-08-08 19:55:12",
    authorization: {
      id: authorizationId,
      status: opcoes.status ?? "ACTIVE",
      value: null,
      frequency: "MONTHLY",
      startDate: "08/09/2026",
      customerId: "cus_000008561913",
      paymentCreationMode: "MANUAL",
    },
  };
}

/** Envelope de cobrança nossa (`externalReference = cycle:<id>`). */
function eventoCobranca(
  id: string,
  paymentId: string,
  cicloId: string,
  opcoes: { event?: string; status?: string } = {},
) {
  return {
    id,
    event: opcoes.event ?? "PAYMENT_RECEIVED",
    dateCreated: "2026-08-08 20:01:00",
    payment: {
      id: paymentId,
      status: opcoes.status ?? "RECEIVED",
      value: 117,
      billingType: "PIX",
      externalReference: `cycle:${cicloId}`,
      dateCreated: "2026-08-08",
    },
  };
}

describe.skipIf(!hasDb)("POST /api/hooks/asaas", () => {
  beforeAll(() => {
    // `vi.stubEnv` (e não atribuição direta): o adapter lê `process.env` por
    // chamada justamente para permitir isso, e o unstub no final devolve o
    // ambiente ao estado original sem depender de bookkeeping manual.
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL);
  });

  beforeEach(async () => {
    respostasGateway = [];
    chamadasGateway = [];
    vi.stubGlobal("fetch", async (entrada: unknown) => {
      chamadasGateway.push(String(entrada));
      const proxima = respostasGateway.shift();
      if (!proxima) {
        throw new Error(
          `fetch inesperado para ${String(entrada)} — nenhuma resposta de gateway foi enfileirada neste teste`,
        );
      }
      return proxima();
    });

    // Estado limpo entre testes: sem isso a ordem de execução vira dependência
    // oculta.
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

  // ── Autenticação ───────────────────────────────────────────────────────────

  describe("autenticação (token fixo no header)", () => {
    it("401 com token inválido", async () => {
      const res = await POST(
        requisicao({
          token: "token-errado",
          corpo: { id: novoIdEvento(), event: "y" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401 quando o token válido é prefixo do enviado (tamanhos diferentes)", async () => {
      // timingSafeEqual LANÇA com buffers de tamanhos diferentes; se o handler
      // não comparar o tamanho antes, este caso vira 500 (que o Asaas reentrega
      // em loop) em vez de 401.
      const res = await POST(
        requisicao({
          token: `${TOKEN}-a-mais`,
          corpo: { id: novoIdEvento(), event: "y" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401 sem o header", async () => {
      const res = await POST(
        requisicao({ token: null, corpo: { id: novoIdEvento() } }),
      );
      expect(res.status).toBe(401);
    });

    it("401 quando ASAAS_WEBHOOK_TOKEN não está configurada", async () => {
      // Nunca "passa porque não há token configurado": sem env, tudo é 401.
      vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
      try {
        const res = await POST(
          requisicao({
            token: TOKEN,
            corpo: { id: novoIdEvento(), event: "y" },
          }),
        );
        expect(res.status).toBe(401);
      } finally {
        vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
      }
    });

    it("401 não revela se o token existe ou não", async () => {
      vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
      const semEnv = await POST(requisicao({ token: TOKEN, corpo: {} })).then(
        (r) => r.text(),
      );
      vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
      const comEnv = await POST(requisicao({ token: "outro", corpo: {} })).then(
        (r) => r.text(),
      );
      expect(semEnv).toBe(comEnv);
    });
  });

  // ── Corpo ──────────────────────────────────────────────────────────────────

  describe("corpo (token válido)", () => {
    it("400 com corpo JSON malformado (não 500)", async () => {
      const res = await POST(
        requisicao({ token: TOKEN, corpoCru: "{isso não é json" }),
      );
      expect(res.status).toBe(400);
    });

    it("400 quando faltam `event`/`id`", async () => {
      const semEvento = await POST(
        requisicao({ token: TOKEN, corpo: { id: novoIdEvento() } }),
      );
      expect(semEvento.status).toBe(400);

      const semId = await POST(
        requisicao({
          token: TOKEN,
          corpo: { event: "PIX_AUTOMATIC_RECURRING_CREATED" },
        }),
      );
      expect(semId.status).toBe(400);

      // Recusa ANTES de qualquer consulta: nenhuma resposta foi enfileirada, e
      // se o handler tivesse chamado o gateway o dublê teria estourado.
      expect(chamadasGateway).toHaveLength(0);
    });

    it("200 e grava o evento com o payload BRUTO preservado", async () => {
      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: {
            id,
            event: "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
            account: { id: "conta-x" },
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(await contarLinhas(id)).toBe(1);

      const linha = (await lerEvento(id))!;
      expect(linha.evento).toBe("PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED");
      // O bruto é o insumo da varredura de pendentes e de qualquer
      // reprocessamento futuro — não pode ser reserializado nem podado.
      expect(linha.payload.account).toEqual({ id: "conta-x" });
    });
  });

  // ── Deduplicação ───────────────────────────────────────────────────────────

  describe("deduplicação", () => {
    it("mesmo id reprocessado responde duplicado e não grava linha nova", async () => {
      const id = novoIdEvento();
      const corpo = {
        id,
        event: "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
      };

      const primeira = await POST(requisicao({ token: TOKEN, corpo }));
      expect(await primeira.json()).toEqual({ received: true });

      const segunda = await POST(requisicao({ token: TOKEN, corpo }));
      expect(segunda.status).toBe(200);
      expect(await segunda.json()).toEqual({ received: true, duplicado: true });

      expect(await contarLinhas(id)).toBe(1);
      // A 2ª entrega não pode nem ter consultado o gateway (nenhuma resposta
      // enfileirada: se tivesse consultado, o dublê teria estourado).
      expect(chamadasGateway).toHaveLength(0);
    });

    it("idempotência sob corrida: entrega concorrente ainda não commitada", async () => {
      /**
       * Este é o teste que de fato PROVA a dedup atômica — e ele existe porque a
       * versão óbvia NÃO provava nada. `Promise.all([POST, POST])` continuava
       * VERDE com um SELECT-then-INSERT nu (o pool do postgres.js serializa o
       * suficiente para a 1ª gravação commitar antes da 2ª leitura).
       *
       * Aqui a corrida é FORÇADA: a role dona insere a linha e NÃO commita.
       *   - SELECT-then-INSERT: o SELECT não vê a linha, o INSERT bloqueia e, no
       *     COMMIT do outro lado, estoura 23505 → 500 (Asaas reentrega em loop).
       *   - INSERT … ON CONFLICT DO NOTHING: bloqueia igual, mas resolve para
       *     "nada inserido" → 200 duplicado, sem erro.
       */
      const id = novoIdEvento();
      const corpo = { id, event: "PIX_AUTOMATIC_RECURRING_CREATED" };

      let liberar!: () => void;
      const podeCommitar = new Promise<void>((r) => (liberar = r));
      let jaInseriu!: () => void;
      const linhaSegurada = new Promise<void>((r) => (jaInseriu = r));

      const transacaoConcorrente = owner!.begin(async (tx) => {
        await tx`INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
                 VALUES (${id}, ${corpo.event}, ${owner!.json(corpo)})`;
        jaInseriu();
        await podeCommitar;
      });

      // Só dispara o handler DEPOIS que a linha está de fato segurada: sem isso
      // o handler ganha a corrida e ela nunca acontece.
      await linhaSegurada;

      const resposta = POST(requisicao({ token: TOKEN, corpo }));
      await esperaBloqueio();

      liberar();
      await transacaoConcorrente;

      const res = await resposta;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, duplicado: true });
      expect(await contarLinhas(id)).toBe(1);
    });
  });

  // ── Aplicação de efeito ────────────────────────────────────────────────────

  describe("aplicação de efeito", () => {
    it("autorização ATIVADA → subscription active, ciclo aberto e aplicado_em carimbado", async () => {
      const authId = "53da5204-8dd1-4cf4-9604-d134e1e6fe04";
      const { clinicId } = await novaAssinatura({
        providerSubscriptionId: authId,
      });
      // O estado aplicado vem da CONSULTA ao gateway, nunca do corpo (o Asaas
      // não assina o corpo: quem tiver o token manda o payload que quiser).
      respondeAutorizacao("ACTIVE");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({ token: TOKEN, corpo: eventoAutorizacao(id, authId) }),
      );
      expect(res.status).toBe(200);

      const assinatura = await lerAssinatura(authId);
      expect(assinatura.status).toBe("active");
      expect(assinatura.ativada_em).not.toBeNull();
      expect(assinatura.ciclo_atual_inicio).not.toBeNull();
      expect(assinatura.ciclo_atual_fim).not.toBeNull();

      // A ativação abre o primeiro ciclo — é dele que a apuração parte.
      const ciclos = await authDb.execute(
        sql`SELECT count(*)::int AS n FROM billing_cycle WHERE clinic_id = ${clinicId}::uuid`,
      );
      expect((ciclos as unknown as { n: number }[])[0]!.n).toBe(1);

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBeNull();

      // A consulta foi à autorização, não a `/payments`: um evento de vínculo
      // que caísse no ramo de cobrança tentaria conciliar um id inexistente.
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(
        `/pix/automatic/authorizations/${authId}`,
      );
    });

    it("autorização de vínculo desconhecido → 200 e erro_aplicacao 'assinatura desconhecida'", async () => {
      // Nenhuma linha em `subscription` para este id (TRUNCATE no beforeEach).
      // Não é erro de infra: pode ser evento de outra aplicação apontada para o
      // mesmo endpoint. Fica registrado e SAI da fila.
      respondeAutorizacao("ACTIVE");
      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoAutorizacao(id, "auth-de-outra-conta"),
        }),
      );
      expect(res.status).toBe(200);

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBe("assinatura desconhecida");
    });

    it("cobrança RECEIVED concilia o ciclo → status pago e cobrado_em preenchido", async () => {
      const paymentId = "pay_000000000123";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("RECEIVED");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoCobranca(id, paymentId, cicloId),
        }),
      );
      expect(res.status).toBe(200);

      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("pago");
      expect(ciclo.cobrado_em).not.toBeNull();
      expect(ciclo.erro).toBeNull();

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBeNull();

      // A cobrança tem precedência sobre o vínculo: a consulta tem que ter ido
      // a `/payments/{id}`. Se o handler tivesse tratado o evento como de
      // vínculo, o ciclo ficaria eternamente em `aguardando_pagamento`.
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(`/payments/${paymentId}`);
    });

    it("cobrança recusada sem motivo do gateway grava diagnóstico que nomeia o teto como causa provável (#286)", async () => {
      /**
       * O modo de falha mais provável da cobrança recorrente, agora que se
       * sabe que o teto é obrigatório por diretriz do BACEN: a clínica
       * autorizou com o teto sugerido em tela na ativação (R$ 0,01) e a
       * fatura real não passa. Sem nomear a hipótese, o ciclo só dizia
       * "cobrança recusada pelo gateway", e quem fosse diagnosticar olharia o
       * adapter e o job antes de olhar a configuração no banco do cliente.
       *
       * Este teste passa pelo caminho REAL do webhook — o repasse de
       * `atual.motivoRecusa` dentro de `route.ts` é código novo, e um teste
       * que chamasse `conciliarPagamentoDeCiclo` direto passaria verde mesmo
       * se a rota não repassasse o motivo. O dublê do gateway não devolve
       * `refusalReason`/`failureReason`/`pixTransaction`: é o caso medido em
       * produção em 13/08/2026 — nenhuma recusa observável trouxe motivo.
       */
      const paymentId = "pay_recusada_286_1";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("OVERDUE");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoCobranca(id, paymentId, cicloId, {
            event: "PAYMENT_OVERDUE",
            status: "OVERDUE",
          }),
        }),
      );
      expect(res.status).toBe(200);

      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("falhou");
      expect(ciclo.erro).toMatch(/teto/i);
      expect(ciclo.erro).toMatch(/sem motivo informado/i);
    });

    it("cobrança recusada COM motivo do gateway grava o motivo bruto, sem inventar hipótese (#286)", async () => {
      /**
       * Fix round 1 (revisão do #286): a versão anterior deste teste chamava
       * `conciliarPagamentoDeCiclo` direto, o que passa verde mesmo se
       * `route.ts` parar de repassar `atual.motivoRecusa` — o default `null`
       * do terceiro parâmetro mascara a regressão (mutação confirmada:
       * apagar `atual.motivoRecusa,` de `route.ts` não derrubava este teste
       * na forma antiga). Agora passa pelo caminho REAL do webhook: o dublê
       * devolve `refusalReason`, e só um repasse de fato correto produz o
       * motivo bruto no `erro` do ciclo.
       */
      const paymentId = "pay_recusada_286_2";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("OVERDUE", 117, {
        refusalReason: "SALDO_INSUFICIENTE",
      });

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoCobranca(id, paymentId, cicloId, {
            event: "PAYMENT_OVERDUE",
            status: "OVERDUE",
          }),
        }),
      );
      expect(res.status).toBe(200);

      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("falhou");
      // Quando o gateway diz a causa, ela manda — o diagnóstico do Iris não
      // pode sobrepor "provavelmente é o teto" a um "saldo insuficiente"
      // explícito: a orientação ao cliente é oposta nos dois casos.
      expect(ciclo.erro).toContain("SALDO_INSUFICIENTE");
      expect(ciclo.erro).not.toMatch(/teto/i);
    });

    it("instrução de débito (traz OS DOIS ids) é tratada como COBRANÇA, não como vínculo", async () => {
      /**
       * O evento de instrução de pagamento do Pix Automático carrega o id da
       * cobrança E o da autorização (a instrução aponta para a autorização). É
       * o único payload em que a precedência "cobrança antes de vínculo"
       * importa: tratá-lo como evento de vínculo deixaria a fatura eternamente
       * em `aguardando_pagamento`.
       */
      const paymentId = "pay_000000000777";
      const authId = "auth-da-instrucao";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("RECEIVED");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: {
            id,
            event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_RECEIVED",
            dateCreated: "2026-08-08 21:00:00",
            paymentInstruction: {
              id: "pi_0001",
              paymentId,
              status: "RECEIVED",
              authorization: { id: authId },
            },
          },
        }),
      );
      expect(res.status).toBe(200);

      // A ÚNICA consulta foi a `/payments` — nenhuma a `/authorizations`.
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(`/payments/${paymentId}`);

      expect((await lerCiclo(cicloId)).status).toBe("pago");
      expect((await lerEvento(id))!.erro_aplicacao).toBeNull();
    });

    it("cobrança sem ciclo correspondente → 200 e erro_aplicacao nomeado (sai da fila)", async () => {
      respondeCobranca("RECEIVED");
      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoCobranca(id, "pay_sem_ciclo", crypto.randomUUID()),
        }),
      );
      expect(res.status).toBe(200);

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBe("cobrança sem ciclo correspondente");
    });

    it("evento sem id utilizável carimba aplicado_em com motivo (não fica na fila para sempre)", async () => {
      // `PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED` é sobre a CONTA: não tem
      // `payment` nem `authorization`. Deixá-lo pendente faria a varredura
      // tentar reaplicá-lo em toda passada, para sempre.
      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: {
            id,
            event: "PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED",
            account: { id: "conta-x" },
          },
        }),
      );
      expect(res.status).toBe(200);

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBe("evento sem id utilizável");
      // E nenhuma consulta ao gateway: não há id para consultar.
      expect(chamadasGateway).toHaveLength(0);
    });

    /**
     * O caso mais importante do arquivo. A fila do Asaas PARA depois de 15
     * falhas consecutivas, e evento não entregue some em 14 dias — devolver 5xx
     * por falha de aplicação trocaria um efeito atrasado (recuperável pela
     * varredura de pendentes) por um webhook desligado e eventos perdidos.
     */
    it("gateway 500 na aplicação → 200, aplicado_em NULL e erro_aplicacao preenchido", async () => {
      const authId = "auth-gateway-fora";
      await novaAssinatura({ providerSubscriptionId: authId });
      respondeHttp(500, {
        errors: [{ code: "internal", description: "boom" }],
      });

      const id = novoIdEvento();
      const res = await POST(
        requisicao({ token: TOKEN, corpo: eventoAutorizacao(id, authId) }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      const evento = (await lerEvento(id))!;
      // NULL, não carimbado: é isso que mantém a linha elegível na varredura.
      expect(evento.aplicado_em).toBeNull();
      expect(evento.erro_aplicacao).toContain("500");

      // Estado local intocado — nada foi inventado a partir do payload, que
      // dizia `ACTIVE`.
      expect((await lerAssinatura(authId)).status).toBe("setup_pending");

      // E a entrega ficou durável mesmo com o efeito não aplicado.
      expect(await contarLinhas(id)).toBe(1);
    });

    it("gateway 500 na conciliação de cobrança → 200, ciclo intocado e evento pendente", async () => {
      const paymentId = "pay_000000000999";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeHttp(500);

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoCobranca(id, paymentId, cicloId),
        }),
      );
      expect(res.status).toBe(200);

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).toBeNull();
      expect(evento.erro_aplicacao).toContain("500");

      // O ciclo NÃO pode ter virado pago por um evento que dizia RECEIVED sem
      // confirmação do gateway.
      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("aguardando_pagamento");
      expect(ciclo.cobrado_em).toBeNull();
    });

    it("evento desconhecido é registrado e responde 200 (nunca 500)", async () => {
      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: { id, event: "EVENTO_QUE_AINDA_NAO_EXISTE_V9" },
        }),
      );
      expect(res.status).toBe(200);
      expect(await contarLinhas(id)).toBe(1);
    });
  });
});
