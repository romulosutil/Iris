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

/**
 * Assinatura ATIVA no meio do ciclo, com ciclo `aberto` e pacientes que já
 * entrariam na fatura — o estado real de quem revoga a autorização no app do
 * banco no dia 10 (#287).
 *
 * `inicio` é 9 dias e 12 horas atrás, e não "10 dias": a janela de uso é medida
 * contra o instante em que o handler roda, alguns milissegundos depois do
 * INSERT. Com 10 dias cravados, o `ceil` do pro-rata cairia no dia 11 por causa
 * desses milissegundos, e o valor esperado do teste dependeria da latência da
 * máquina. Com a meia hora de folga, qualquer instante dentro de ~12h dá o
 * mesmo décimo dia.
 */
async function assinaturaAtivaNoMeioDoCiclo(opcoes: {
  providerSubscriptionId: string;
  pacientes: number;
}): Promise<{ clinicId: string; subscriptionId: string; cicloId: string }> {
  const { clinicId, subscriptionId } = await novaAssinatura({
    providerSubscriptionId: opcoes.providerSubscriptionId,
    status: "active",
  });

  await owner!`
    UPDATE subscription
       SET ciclo_atual_inicio = now() - interval '9 days 12 hours',
           ciclo_atual_fim    = now() + interval '20 days 12 hours',
           ativada_em         = now() - interval '9 days 12 hours'
     WHERE id = ${subscriptionId}`;

  // Pacientes criados AGORA caem dentro de `[inicio, fim)` e são contados por
  // `billing_apurar_ciclo` pelo critério `criado_no_ciclo`.
  for (let i = 0; i < opcoes.pacientes; i += 1) {
    await owner!`
      INSERT INTO patient (clinic_id, nome)
      VALUES (${clinicId}, ${`Paciente ${i + 1} do ciclo`})`;
  }

  const linhas = await owner!`
    INSERT INTO billing_cycle (clinic_id, subscription_id, inicio, fim, status)
    SELECT ${clinicId}, ${subscriptionId}, s.ciclo_atual_inicio, s.ciclo_atual_fim,
           'aberto'::billing_cycle_status
      FROM subscription s WHERE s.id = ${subscriptionId}
    RETURNING id`;

  return { clinicId, subscriptionId, cicloId: linhas[0]!.id as string };
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
    sql`SELECT status::text AS status, ativada_em, past_due_desde, cancelada_em,
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
      cancelada_em: unknown;
      ciclo_atual_inicio: unknown;
      ciclo_atual_fim: unknown;
    }[]
  )[0]!;
}

async function lerCiclo(cicloId: string) {
  const r = await authDb.execute(
    sql`SELECT status::text AS status, cobrado_em, erro,
               pacientes_contados, valor_centavos, apurado_em,
               provider_charge_id, cobranca_emitida_em
        FROM billing_cycle WHERE id = ${cicloId}::uuid`,
  );
  return (
    r as unknown as {
      status: string;
      cobrado_em: unknown;
      erro: string | null;
      pacientes_contados: number;
      valor_centavos: number;
      apurado_em: unknown;
      provider_charge_id: string | null;
      cobranca_emitida_em: unknown;
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
 * `extra` mescla campos crus no corpo.
 *
 * ⚠️ O corpo daqui NÃO tem campo de motivo de recusa, e isso é o contrato, não
 * economia de dublê: o `PaymentGetResponseDTO` do Asaas não declara
 * `refusalReason` (D35). Quem tem o motivo é a INSTRUÇÃO — ver
 * `respondeInstrucao`.
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

/**
 * `GET /pix/automatic/paymentInstructions/{id}` — o recurso que de fato tem o
 * `refusalReason`. Códigos são os reais do catálogo do Asaas (inglês,
 * `MAXIMUM_AMOUNT_EXCEEDED`/`PAYMENT_OVERDUE`/…), nunca inventados em
 * português: um dublê com código inventado passa por passthrough de string e
 * não prova nada sobre o campo que a produção devolve.
 */
function respondeInstrucao(refusalReason: string | null) {
  respostasGateway.push(async () =>
    Response.json({
      id: "pi-dublê",
      status: "REFUSED",
      paymentId: "pay-dublê",
      ...(refusalReason === null ? {} : { refusalReason }),
    }),
  );
}

/** `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`. */
function respondeInstrucoes(itens: Array<Record<string, unknown>>) {
  respostasGateway.push(async () => Response.json({ data: itens }));
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
        // Pacientes ANTES das clínicas: `patient.clinic_id` é `ON DELETE
        // restrict`, então a limpeza falharia calada no `afterAll` e deixaria
        // lixo para o próximo arquivo.
        await owner`DELETE FROM patient WHERE clinic_id = ANY(${clinicasCriadas}::uuid[])`;
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

    /**
     * #287 Problema 1 — o ciclo aberto não pode sobreviver ao cancelamento.
     *
     * Antes desta suíte não havia teste nenhum do caminho de revogação, que é o
     * caminho de TODO cancelamento hoje (a UI in-app não existe; a clínica
     * revoga a autorização no app do banco). O ciclo ficava em `aberto` para
     * sempre: `fecharCiclosVencendo` varre `status = 'active'` e nunca mais
     * enxerga uma assinatura `canceled`. Receita perdida sem nada vermelho.
     *
     * A saída implementada é a (b) da #287, decidida na #290: congela o ciclo
     * como DÉBITO pro-rata (`devido`) e não emite cobrança nenhuma — o trilho do
     * Pix Automático acabou de ser revogado, não há como cobrar naquele
     * instante. Quem cobra é o gate de reativação (#290).
     */
    it("autorização CANCELADA fecha o ciclo aberto como débito pro-rata, sem emitir cobrança", async () => {
      const authId = "8f3a9a2e-1f6a-4e2b-9f77-1b2c3d4e5f60";
      const { cicloId } = await assinaturaAtivaNoMeioDoCiclo({
        providerSubscriptionId: authId,
        pacientes: 1,
      });
      respondeAutorizacao("CANCELLED");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoAutorizacao(id, authId, {
            event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
            status: "CANCELLED",
          }),
        }),
      );
      expect(res.status).toBe(200);

      const assinatura = await lerAssinatura(authId);
      expect(assinatura.status).toBe("canceled");
      expect(assinatura.cancelada_em).not.toBeNull();

      const ciclo = await lerCiclo(cicloId);
      // O estado terminal do ciclo interrompido. `aberto` aqui é o bug da #287.
      expect(ciclo.status).toBe("devido");
      expect(ciclo.apurado_em).not.toBeNull();
      expect(ciclo.pacientes_contados).toBe(1);
      // 1 ficha = 3900 cheios; 10 dias usados de 30 → 3900 x 10 / 30 = 1300.
      // Constante literal, não a fórmula: com a fórmula no expect, um pro-rata
      // errado passaria por concordar consigo mesmo.
      expect(ciclo.valor_centavos).toBe(1300);

      // Nem cobrança emitida, nem ciclo dado como pago. Só o débito congelado.
      expect(ciclo.provider_charge_id).toBeNull();
      expect(ciclo.cobranca_emitida_em).toBeNull();
      expect(ciclo.cobrado_em).toBeNull();
      expect(ciclo.erro).toBeNull();

      const evento = (await lerEvento(id))!;
      expect(evento.aplicado_em).not.toBeNull();
      expect(evento.erro_aplicacao).toBeNull();

      // Uma única ida ao gateway: a consulta da autorização. Qualquer POST em
      // `/payments` aqui seria uma cobrança num trilho já revogado.
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(
        `/pix/automatic/authorizations/${authId}`,
      );
    });

    it("reentrega do cancelamento não reabre nem recalcula o débito já congelado", async () => {
      // O Asaas reentrega o mesmo fato com ids de evento diferentes. Sem guarda
      // de transição, a segunda passada reapuraria o ciclo com `cancelada_em`
      // mais recente e o valor mudaria depois de congelado.
      const authId = "0c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f";
      const { cicloId } = await assinaturaAtivaNoMeioDoCiclo({
        providerSubscriptionId: authId,
        pacientes: 1,
      });

      respondeAutorizacao("CANCELLED");
      await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoAutorizacao(novoIdEvento(), authId, {
            status: "CANCELLED",
          }),
        }),
      );
      const primeiro = await lerCiclo(cicloId);
      expect(primeiro.status).toBe("devido");

      respondeAutorizacao("CANCELLED");
      await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoAutorizacao(novoIdEvento(), authId, {
            status: "CANCELLED",
          }),
        }),
      );

      const segundo = await lerCiclo(cicloId);
      expect(segundo.status).toBe("devido");
      expect(segundo.valor_centavos).toBe(primeiro.valor_centavos);
      expect(segundo.apurado_em).toEqual(primeiro.apurado_em);
    });

    it("cancelamento NÃO mexe em ciclo com cobrança já emitida — o dinheiro está em trânsito", async () => {
      // `aguardando_pagamento` significa cobrança viva no gateway. Regravar o
      // valor como pro-rata aqui descolaria o memorial da fatura que a clínica
      // recebeu, e o webhook de pagamento chegaria para um ciclo remarcado.
      const authId = "5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e";
      const { clinicId, subscriptionId } = await novaAssinatura({
        providerSubscriptionId: authId,
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
          3, 11700, now(), 'pay_ja_emitida_287', now()
        )
        RETURNING id`;
      const cicloId = linhas[0]!.id as string;

      respondeAutorizacao("CANCELLED");
      await POST(
        requisicao({
          token: TOKEN,
          corpo: eventoAutorizacao(novoIdEvento(), authId, {
            status: "CANCELLED",
          }),
        }),
      );

      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("aguardando_pagamento");
      expect(ciclo.valor_centavos).toBe(11700);
      expect(ciclo.provider_charge_id).toBe("pay_ja_emitida_287");
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
       * se a rota não repassasse o motivo.
       *
       * Aqui o evento é de COBRANÇA (sem instrução), então o adapter cai no
       * índice por `paymentId` — e a lista volta vazia, que é o caso "o
       * gateway não informou". É esse `null` que faz o diagnóstico nomear o
       * teto como hipótese.
       */
      const paymentId = "pay_recusada_286_1";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("OVERDUE");
      respondeInstrucoes([]);

      // O `console.warn` com tag greppável ("[billing-recusa]") é o mecanismo
      // pelo qual a primeira recusa real de produção vira sinal em vez de
      // linha morta na tabela — sem esta asserção, removê-lo seria invisível.
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

      // `try/finally`: qualquer `expect` que falhe aqui dentro lança, e sem o
      // `finally` o dublê de `console.warn` vazaria para os testes seguintes
      // do arquivo (silenciando avisos que eles deveriam ver).
      try {
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

        expect(aviso).toHaveBeenCalledWith(
          "[billing-recusa] cobrança de ciclo recusada",
          expect.objectContaining({ providerChargeId: paymentId }),
        );
      } finally {
        aviso.mockRestore();
      }
    });

    it("recusa de instrução: o motivo vem da INSTRUÇÃO e chega ao ciclo (D35)", async () => {
      /**
       * O teste do trilho inteiro do D35, ponta a ponta: envelope de webhook →
       * `normalizarEventoAsaas` preserva `paymentInstruction.id` → `route.ts`
       * repassa esse id → o adapter consulta
       * `GET /pix/automatic/paymentInstructions/{id}` → o código bruto pousa em
       * `billing_cycle.erro`.
       *
       * É a régua de comportamento, não de eco: o dublê da COBRANÇA não tem
       * campo de motivo nenhum (como a produção), então o único jeito de
       * `PAYMENT_OVERDUE` aparecer no ciclo é o adapter ter ido ao recurso
       * certo com o id certo. Duas mutações confirmadas derrubam este teste:
       *
       *  - apagar `providerInstructionId: idInstrucao` de `normalizarEventoAsaas`;
       *  - apagar `{ providerInstructionId }` da chamada em `route.ts`.
       *
       * Nos dois casos o adapter cai no índice por `paymentId`, a URL muda e o
       * corpo enfileirado deixa de casar — o motivo volta `null` e o `erro`
       * regride para o texto de hipótese do #286.
       *
       * Fix round 1 (revisão do #286), preservado: passa pelo caminho REAL do
       * webhook. Chamar `conciliarPagamentoDeCiclo` direto passaria verde mesmo
       * com `route.ts` sem repassar o motivo (o default `null` do 3º parâmetro
       * mascara a regressão — mutação confirmada na forma antiga).
       */
      const paymentId = "pay_recusada_286_2";
      const instrucaoId = "pi_recusada_286_2";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      respondeCobranca("OVERDUE");
      // Código REAL do catálogo do Asaas (`PAYMENT_OVERDUE` = "charge overdue
      // due to insufficient balance or available limit"). O código inventado em
      // português que estava aqui só provava passthrough de string.
      respondeInstrucao("PAYMENT_OVERDUE");

      const id = novoIdEvento();
      const res = await POST(
        requisicao({
          token: TOKEN,
          corpo: {
            id,
            event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
            dateCreated: "2026-08-08 21:30:00",
            payment: {
              id: paymentId,
              status: "OVERDUE",
              value: 117,
              externalReference: `cycle:${cicloId}`,
            },
            paymentInstruction: {
              id: instrucaoId,
              paymentId,
              status: "REFUSED",
              authorization: { id: "auth-da-instrucao-recusada-286" },
            },
          },
        }),
      );
      expect(res.status).toBe(200);

      // O recurso consultado é o oráculo: a segunda chamada tem que ser a da
      // INSTRUÇÃO, pelo id que veio no evento.
      expect(chamadasGateway).toHaveLength(2);
      expect(chamadasGateway[0]).toContain(`/payments/${paymentId}`);
      expect(chamadasGateway[1]).toContain(
        `/pix/automatic/paymentInstructions/${instrucaoId}`,
      );

      const ciclo = await lerCiclo(cicloId);
      expect(ciclo.status).toBe("falhou");
      // Quando o gateway diz a causa, ela manda — o diagnóstico do Iris não
      // pode sobrepor "provavelmente é o teto" a um motivo explícito: a
      // orientação ao cliente é oposta nos dois casos.
      expect(ciclo.erro).toContain("PAYMENT_OVERDUE");
      expect(ciclo.erro).not.toMatch(/teto/i);
    });

    it("INSTRUCTION_REFUSED cuja reconsulta NÃO devolve OVERDUE deixa rastro em vez de sumir (#286)", async () => {
      /**
       * A metade NÃO MEDIDA da #286. Todo o diagnóstico do teto pendura numa
       * suposição: que uma recusa de instrução real deixe o `payment` em
       * `OVERDUE` (único status que `mapearStatusCobranca` leva a `recusada`).
       * O sandbox de 13/08/2026 só tinha cobrança em `PENDING` — nenhuma recusa
       * de fato aconteceu, então a suposição segue sem prova.
       *
       * Este teste fixa o que acontece se ela estiver ERRADA, e é o cenário que
       * o PR original deixava mudo: o ciclo NÃO cai em `falhou`, fica parado em
       * `aguardando_pagamento` (não existe varredura que olhe esse estado), e o
       * evento é carimbado `aplicado_em` com `erro_aplicacao = NULL` — do banco,
       * é indistinguível de uma aplicação limpa. Sem o `console.warn`, a
       * primeira recusa real de produção passaria sem deixar UM único sinal, e
       * o runbook do `infra/README.md` ("meça na primeira recusa real") não
       * teria como ser acionado.
       *
       * O aviso é observabilidade, não decisão: virar `falhou` um `payment` que
       * o gateway afirma estar `PENDING` poria a clínica em `past_due` por
       * suposição — exatamente o erro que a #286 existe para evitar.
       */
      const paymentId = "pay_recusa_sem_overdue_286";
      const { cicloId } = await novoCiclo({ providerChargeId: paymentId });
      // A reconsulta discorda do evento: para o gateway a cobrança segue viva.
      respondeCobranca("PENDING");
      // A instrução é consultada mesmo assim (o evento trouxe o id dela): é
      // justamente na divergência que o motivo importa para o diagnóstico.
      respondeInstrucao("MAXIMUM_AMOUNT_EXCEEDED");

      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const id = novoIdEvento();
        const res = await POST(
          requisicao({
            token: TOKEN,
            corpo: {
              id,
              event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
              dateCreated: "2026-08-08 21:30:00",
              payment: {
                id: paymentId,
                externalReference: `cycle:${cicloId}`,
              },
              paymentInstruction: {
                id: "pi_0002",
                paymentId,
                status: "REFUSED",
                authorization: { id: "auth-da-instrucao-recusada" },
              },
            },
          }),
        );
        expect(res.status).toBe(200);

        // O estado NÃO se move — é essa a parte silenciosa.
        expect((await lerCiclo(cicloId)).status).toBe("aguardando_pagamento");
        const evento = (await lerEvento(id))!;
        expect(evento.aplicado_em).not.toBeNull();
        expect(evento.erro_aplicacao).toBeNull();

        // ...e é por isso que o sinal tem que vir do log. Mesma tag
        // `[billing-recusa]` da recusa conciliada: um grep só traz as duas
        // metades da hipótese.
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
