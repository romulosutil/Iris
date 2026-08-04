import { createHmac } from "node:crypto";
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
const { reprocessarEventosPendentes } = await import("@/lib/billing/subscription");

/**
 * Webhook do Mercado Pago (#36).
 *
 * `.int.test.ts` (roda em `pnpm test:rls`) pelo mesmo motivo do gêmeo do Asaas:
 * a garantia central — dedup — é o `UNIQUE (provider_event_id)` do Postgres
 * decidindo a corrida entre duas entregas simultâneas. Com `authDb` dublado, um
 * SELECT-then-INSERT nu passaria verde, que é exatamente o bug que a dedup
 * existe para evitar. E a segunda garantia — "reentrega não abre um segundo
 * `billing_cycle`" — é o UNIQUE `(clinic_id, inicio)`, também do banco.
 *
 * ## Como o gateway foi dublado
 *
 * O adapter (`src/lib/billing/provider/mercado-pago.ts`) fala com o MP por
 * `fetch` NATIVO. Então o dublê é `vi.stubGlobal("fetch", …)` — e só ele. Nada
 * do módulo sob teste é mockado: a verificação de HMAC, o parse do header, a
 * janela de replay, o `normalizarEvento` e o `mapearStatus` rodam de verdade.
 * Um `vi.mock` do provider inteiro teria trocado justamente o que este arquivo
 * precisa provar por um dublê que sempre concorda.
 *
 * ## Como a assinatura é gerada
 *
 * O manifest é escrito LITERALMENTE aqui (`id:…;request-id:…;ts:…;`), sem
 * importar nada do módulo sob teste. É deliberado: se alguém mudar o formato do
 * manifest no adapter, este arquivo fica VERMELHO. Importar a função de
 * manifest faria o teste concordar com qualquer mudança — inclusive com a que
 * derruba o webhook em produção.
 */

const SEGREDO = "segredo-de-teste-do-mercadopago-36";
const ACCESS_TOKEN = "access-token-de-teste-36";
const URL_BASE = "https://irisclinica.ia.br/api/hooks/mercadopago";

/**
 * `iris_auth` não tem DELETE em `mercadopago_webhook_event` (trilha de webhook
 * não é apagável pelo app), então a limpeza usa a role DONA — igual aos demais
 * .int.test.ts do repo.
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

async function novaClinica(): Promise<string> {
  const linhas = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica teste MP ${crypto.randomUUID()}`})
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
      'mercado_pago',
      ${opcoes.providerSubscriptionId},
      ${opcoes.cicloDias ?? 30}
    )
    RETURNING id`;
  return { clinicId, subscriptionId: linhas[0]!.id as string };
}

// ── Construção da requisição assinada ────────────────────────────────────────

interface OpcoesRequisicao {
  /**
   * Vai para o query param `data.id` — é ele que entra no manifest. `null`
   * OMITE o parâmetro (o MP nem sempre o manda); nesse caso o manifest é
   * assinado com id vazio, que é como o adapter o monta.
   */
  dataIdNaUrl: string | null;
  corpo?: unknown;
  corpoCru?: string;
  requestId?: string;
  /** ms; default `Date.now()`. */
  ts?: number;
  /** `undefined` → assina de verdade; `null` → sem header; string → literal. */
  assinatura?: string | null;
  segredo?: string;
}

function manifestLiteral(dataId: string, requestId: string, ts: number): string {
  // Escrito à mão de propósito — ver o cabeçalho do arquivo.
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

function requisicao(o: OpcoesRequisicao): Request {
  const requestId = o.requestId ?? "req-teste-36";
  const ts = o.ts ?? Date.now();
  const corpoTexto = o.corpoCru ?? JSON.stringify(o.corpo ?? {});
  const url =
    o.dataIdNaUrl === null
      ? `${URL_BASE}?type=preapproval`
      : `${URL_BASE}?data.id=${encodeURIComponent(o.dataIdNaUrl)}&type=preapproval`;

  const headers = new Headers({
    "content-type": "application/json",
    "x-request-id": requestId,
  });

  if (o.assinatura === undefined) {
    const hmac = createHmac("sha256", o.segredo ?? SEGREDO)
      .update(manifestLiteral(o.dataIdNaUrl ?? "", requestId, ts))
      .digest("hex");
    headers.set("x-signature", `ts=${ts},v1=${hmac}`);
  } else if (o.assinatura !== null) {
    headers.set("x-signature", o.assinatura);
  }

  return new Request(url, { method: "POST", headers, body: corpoTexto });
}

/** Notificação típica do MP: `{type, action, data:{id}}`. */
function notificacao(subId: string, action: string) {
  return { type: "preapproval", action, data: { id: subId } };
}

// ── Consultas de verificação ─────────────────────────────────────────────────

async function contarEventos(providerEventId: string): Promise<number> {
  const r = await authDb.execute(
    sql`SELECT count(*)::int AS n FROM mercadopago_webhook_event
        WHERE provider_event_id = ${providerEventId}`,
  );
  return (r as unknown as { n: number }[])[0]!.n;
}

async function lerEvento(providerEventId: string) {
  const r = await authDb.execute(
    sql`SELECT aplicado_em, erro_aplicacao, evento, payload
        FROM mercadopago_webhook_event WHERE provider_event_id = ${providerEventId}`,
  );
  return (
    r as unknown as {
      aplicado_em: Date | null;
      erro_aplicacao: string | null;
      evento: string;
      payload: unknown;
    }[]
  )[0];
}

async function lerAssinatura(providerSubscriptionId: string) {
  const r = await authDb.execute(
    sql`SELECT status::text AS status, ativada_em, past_due_desde,
               ciclo_atual_inicio, ciclo_atual_fim
        FROM subscription WHERE provider_subscription_id = ${providerSubscriptionId}`,
  );
  // Timestamps voltam CRUS de `execute` (texto do driver, não `Date`) — por isso
  // as comparações abaixo são sobre o valor cru, sem conversão. Normalizar antes
  // de comparar é justamente como um teste deixa de testar.
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

async function contarCiclos(clinicId: string): Promise<number> {
  const r = await authDb.execute(
    sql`SELECT count(*)::int AS n FROM billing_cycle WHERE clinic_id = ${clinicId}`,
  );
  return (r as unknown as { n: number }[])[0]!.n;
}

/**
 * Espera até que ALGUMA sessão esteja bloqueada esperando lock em
 * `mercadopago_webhook_event`. Substitui um `sleep` arbitrário: o teste só segue
 * quando o fato que ele precisa (handler bloqueado) é observável no catálogo.
 */
async function esperaBloqueio(): Promise<void> {
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    const r = await owner!`
      SELECT count(*)::int AS n
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%mercadopago_webhook_event%'`;
    if (r[0]!.n > 0) return;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(
    "handler nunca bloqueou — a corrida não foi exercida, o teste seria vácuo",
  );
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

/** Fila de respostas do `fetch` para a API do MP. Cada chamada consome uma. */
let respostasGateway: Array<() => Promise<Response>> = [];
let chamadasGateway: string[] = [];

function respondeStatus(status: string, valorReais = 39) {
  respostasGateway.push(async () =>
    Response.json({
      id: "preapproval-dublê",
      status,
      auto_recurring: { transaction_amount: valorReais, currency_id: "BRL" },
    }),
  );
}

/** Resposta HTTP de erro do gateway (vira `BillingProviderError` com `status`). */
function respondeHttp(status: number, corpo: unknown = { message: "erro" }) {
  respostasGateway.push(async () => Response.json(corpo, { status }));
}

function respondeErroDeRede(mensagem: string) {
  respostasGateway.push(async () => {
    throw new Error(mensagem);
  });
}

describe.skipIf(!hasDb)("POST /api/hooks/mercadopago", () => {
  const envAnterior: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const chave of [
      "MERCADOPAGO_WEBHOOK_SECRET",
      "MERCADOPAGO_ACCESS_TOKEN",
      "BILLING_PROVIDER",
    ]) {
      envAnterior[chave] = process.env[chave];
    }
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO;
    process.env.MERCADOPAGO_ACCESS_TOKEN = ACCESS_TOKEN;
    // Explícito: se o `.env` local trouxer `asaas`, `getBillingProvider()`
    // lançaria e o arquivo inteiro falharia por um motivo que não é o testado.
    process.env.BILLING_PROVIDER = "mercado_pago";
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
    // oculta (e o teste de contagem de ciclos seria o primeiro a mentir).
    await owner!`TRUNCATE billing_cycle, subscription, mercadopago_webhook_event
                 RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await owner`TRUNCATE billing_cycle, subscription, mercadopago_webhook_event
                  RESTART IDENTITY CASCADE`;
      if (clinicasCriadas.length > 0) {
        await owner`DELETE FROM clinic WHERE id = ANY(${clinicasCriadas}::uuid[])`;
      }
      await owner.end();
    }
    for (const [chave, valor] of Object.entries(envAnterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  });

  // ── Autenticação ───────────────────────────────────────────────────────────

  describe("autenticação (HMAC)", () => {
    it("401 sem o header x-signature", async () => {
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-1", "updated"),
          assinatura: null,
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401 com x-signature malformado", async () => {
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-1", "updated"),
          assinatura: "isso-nao-e-um-header-do-mp",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401 com HMAC errado", async () => {
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-1", "updated"),
          segredo: "segredo-de-outra-conta",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401 quando MERCADOPAGO_WEBHOOK_SECRET não está configurada", async () => {
      // Nunca "passa porque não há segredo": sem env, tudo é 401.
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
      try {
        const res = await POST(
          requisicao({
            dataIdNaUrl: "sub-1",
            corpo: notificacao("sub-1", "updated"),
          }),
        );
        expect(res.status).toBe(401);
      } finally {
        process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO;
      }
    });

    it("401 em replay: ts fora da janela de 5 min, mesmo com HMAC correto para aquele ts", async () => {
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-1", "updated"),
          ts: Date.now() - 6 * 60 * 1000,
        }),
      );
      expect(res.status).toBe(401);
      // Prova de que o caso é o replay e não HMAC quebrado: o MESMO corpo, com
      // ts atual, é aceito.
      respondeStatus("pending");
      const agora = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-1", "updated"),
        }),
      );
      expect(agora.status).toBe(200);
    });

    it("o corpo do 401 é IDÊNTICO em todos os modos de falha", async () => {
      // Se a resposta distinguir "sem header" de "HMAC errado" de "sem segredo",
      // ela vira oráculo para quem estiver sondando o endpoint.
      const corpo = notificacao("sub-1", "updated");
      const semHeader = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpo, assinatura: null }),
      ).then((r) => r.text());
      const malformado = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpo, assinatura: "ts=,v1=" }),
      ).then((r) => r.text());
      const hmacErrado = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpo, segredo: "outro" }),
      ).then((r) => r.text());
      const replay = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpo, ts: Date.now() - 600_000 }),
      ).then((r) => r.text());

      const anterior = process.env.MERCADOPAGO_WEBHOOK_SECRET;
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
      const semSegredo = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpo }),
      ).then((r) => r.text());
      process.env.MERCADOPAGO_WEBHOOK_SECRET = anterior;

      // Assinatura VÁLIDA para `sub-1`, corpo falando de outra assinatura.
      const adulterado = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: notificacao("sub-outra-clinica", "updated"),
        }),
      ).then((r) => r.text());

      expect(
        new Set([
          semHeader,
          malformado,
          hmacErrado,
          replay,
          semSegredo,
          adulterado,
        ]).size,
      ).toBe(1);
    });
  });

  // ── Corpo adulterado sob assinatura capturada ──────────────────────────────

  describe("corpo adulterado (o HMAC do MP não cobre o corpo)", () => {
    it("assinatura válida para AAA + corpo apontando BBB → 401 e NADA gravado", async () => {
      const res = await POST(
        requisicao({
          dataIdNaUrl: "AAA",
          corpo: notificacao("BBB", "updated"),
        }),
      );
      expect(res.status).toBe(401);

      // O ponto não é o status, é o EFEITO: nenhuma linha de nenhuma das duas
      // chaves possíveis pode existir. Se o corpo tivesse entrado, o efeito de
      // faturamento teria sido aplicado à assinatura errada — possivelmente de
      // outra clínica.
      expect(await contarEventos("preapproval:BBB:updated")).toBe(0);
      expect(await contarEventos("preapproval:AAA:updated")).toBe(0);
      const total = await authDb.execute(
        sql`SELECT count(*)::int AS n FROM mercadopago_webhook_event`,
      );
      expect((total as unknown as { n: number }[])[0]!.n).toBe(0);

      // E o gateway nem foi consultado (nenhuma resposta foi enfileirada; se
      // tivesse havido consulta, o dublê teria estourado).
      expect(chamadasGateway).toHaveLength(0);
    });

    it("caminho feliz não regrediu: query AAA + corpo AAA → 200", async () => {
      respondeStatus("pending");
      const res = await POST(
        requisicao({ dataIdNaUrl: "AAA", corpo: notificacao("AAA", "updated") }),
      );
      expect(res.status).toBe(200);
      expect(await contarEventos("preapproval:AAA:updated")).toBe(1);
    });

    it("query SEM data.id não bloqueia (o MP nem sempre o manda)", async () => {
      // Sem id assinado não há o que confrontar; travar aqui derrubaria formatos
      // legítimos de notificação. O manifest é assinado com id vazio.
      respondeStatus("pending");
      const res = await POST(
        requisicao({
          dataIdNaUrl: null,
          corpo: notificacao("sub-sem-query", "updated"),
        }),
      );
      expect(res.status).toBe(200);
      expect(await contarEventos("preapproval:sub-sem-query:updated")).toBe(1);
    });

    it("corpo SEM data.id e query com data.id não é tratado como adulteração", async () => {
      // Continua sendo 400 (falta chave de dedup), não 401: são recusas com
      // significado diferente e o operador precisa distingui-las no log.
      const res = await POST(
        requisicao({
          dataIdNaUrl: "AAA",
          corpo: { type: "preapproval", action: "updated" },
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Corpo, com assinatura válida ───────────────────────────────────────────

  describe("corpo (assinatura válida)", () => {
    it("400 com corpo não-JSON", async () => {
      const res = await POST(
        requisicao({ dataIdNaUrl: "sub-1", corpoCru: "{isso não é json" }),
      );
      expect(res.status).toBe(400);
    });

    it("400 com payload sem data.id", async () => {
      // A URL assinada TEM `data.id` (é o que entra no manifest); o corpo, não.
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-1",
          corpo: { type: "preapproval", action: "updated" },
        }),
      );
      expect(res.status).toBe(400);
      expect(await contarEventos("preapproval:sub-1:updated")).toBe(0);
    });

    it("200 e grava UMA linha com payload válido", async () => {
      respondeStatus("pending");
      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-a",
          corpo: notificacao("sub-a", "created"),
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(await contarEventos("preapproval:sub-a:created")).toBe(1);

      const linha = await lerEvento("preapproval:sub-a:created")!;
      expect(linha!.evento).toBe("preapproval");
      // Payload BRUTO preservado: o reprocessamento de pendentes lê daqui.
      expect(linha!.payload).toEqual(notificacao("sub-a", "created"));
    });
  });

  // ── Deduplicação ───────────────────────────────────────────────────────────

  describe("deduplicação", () => {
    it("mesma notificação entregue 2x: a segunda responde duplicado e não grava linha nova", async () => {
      respondeStatus("pending");
      const corpo = notificacao("sub-b", "updated");

      const primeira = await POST(
        requisicao({ dataIdNaUrl: "sub-b", corpo }),
      );
      expect(await primeira.json()).toEqual({ received: true });

      const segunda = await POST(requisicao({ dataIdNaUrl: "sub-b", corpo }));
      expect(segunda.status).toBe(200);
      expect(await segunda.json()).toEqual({ received: true, duplicado: true });

      expect(await contarEventos("preapproval:sub-b:updated")).toBe(1);
      // A 2ª entrega não pode nem ter consultado o gateway: se tivesse, o dublê
      // teria estourado "fetch inesperado" (só uma resposta foi enfileirada).
      expect(chamadasGateway).toHaveLength(1);
    });

    it("mesmo data.id com `action` diferente NÃO é duplicata", async () => {
      respondeStatus("pending");
      respondeStatus("pending");

      const a = await POST(
        requisicao({
          dataIdNaUrl: "sub-c",
          corpo: notificacao("sub-c", "created"),
        }),
      );
      const b = await POST(
        requisicao({
          dataIdNaUrl: "sub-c",
          corpo: notificacao("sub-c", "updated"),
        }),
      );

      expect(await a.json()).toEqual({ received: true });
      expect(await b.json()).toEqual({ received: true });
      expect(await contarEventos("preapproval:sub-c:created")).toBe(1);
      expect(await contarEventos("preapproval:sub-c:updated")).toBe(1);
    });

    it("idempotência sob corrida: entrega concorrente ainda não commitada", async () => {
      /**
       * Molde do gêmeo do Asaas, e pelo mesmo motivo: `Promise.all([POST, POST])`
       * NÃO prova nada — o pool do postgres.js serializa o suficiente para a 1ª
       * gravação commitar antes da 2ª leitura, e um SELECT-then-INSERT nu
       * passaria verde. Aqui a corrida é FORÇADA: a role dona insere a linha e
       * NÃO commita.
       *   - SELECT-then-INSERT: o SELECT não vê a linha, o INSERT bloqueia e, no
       *     COMMIT do outro lado, estoura 23505 → 500 (e o MP reentrega em loop).
       *   - INSERT … ON CONFLICT DO NOTHING: bloqueia igual, mas resolve para
       *     "nada inserido" → 200 duplicado, sem erro.
       */
      const chave = "preapproval:sub-race:updated";
      const corpo = notificacao("sub-race", "updated");

      let liberar!: () => void;
      const podeCommitar = new Promise<void>((r) => (liberar = r));
      let jaInseriu!: () => void;
      const linhaSegurada = new Promise<void>((r) => (jaInseriu = r));

      const transacaoConcorrente = owner!.begin(async (tx) => {
        await tx`INSERT INTO mercadopago_webhook_event
                   (provider_event_id, evento, payload)
                 VALUES (${chave}, 'preapproval', ${owner!.json(corpo)})`;
        jaInseriu();
        await podeCommitar;
      });

      // Só dispara o handler DEPOIS que a linha está de fato segurada: sem isso
      // o handler ganha a corrida e ela nunca acontece.
      await linhaSegurada;

      const resposta = POST(requisicao({ dataIdNaUrl: "sub-race", corpo }));
      await esperaBloqueio();

      liberar();
      await transacaoConcorrente;

      const res = await resposta;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, duplicado: true });
      expect(await contarEventos(chave)).toBe(1);
    });
  });

  // ── Aplicação de efeito ────────────────────────────────────────────────────

  describe("aplicação de efeito", () => {
    it("setup_pending + gateway `authorized` → active, ativada_em e ciclo preenchidos, UM billing_cycle", async () => {
      const { clinicId } = await novaAssinatura({
        providerSubscriptionId: "sub-ativa",
      });
      respondeStatus("authorized");

      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-ativa",
          corpo: notificacao("sub-ativa", "updated"),
        }),
      );
      expect(res.status).toBe(200);

      const assinatura = await lerAssinatura("sub-ativa");
      expect(assinatura.status).toBe("active");
      expect(assinatura.ativada_em).not.toBeNull();
      expect(assinatura.ciclo_atual_inicio).not.toBeNull();
      expect(assinatura.ciclo_atual_fim).not.toBeNull();

      expect(await contarCiclos(clinicId)).toBe(1);

      const evento = await lerEvento("preapproval:sub-ativa:updated")!;
      expect(evento!.aplicado_em).not.toBeNull();
      expect(evento!.erro_aplicacao).toBeNull();
    });

    it("reentrega NÃO abre um segundo billing_cycle", async () => {
      const { clinicId } = await novaAssinatura({
        providerSubscriptionId: "sub-reentrega",
      });
      respondeStatus("authorized");

      const primeira = await POST(
        requisicao({
          dataIdNaUrl: "sub-reentrega",
          corpo: notificacao("sub-reentrega", "updated"),
        }),
      );
      expect(primeira.status).toBe(200);
      expect(await contarCiclos(clinicId)).toBe(1);

      // (a) Reentrega LITERAL da mesma notificação: barrada pela dedup.
      const duplicada = await POST(
        requisicao({
          dataIdNaUrl: "sub-reentrega",
          corpo: notificacao("sub-reentrega", "updated"),
        }),
      );
      expect(await duplicada.json()).toEqual({ received: true, duplicado: true });
      expect(await contarCiclos(clinicId)).toBe(1);

      // (b) Notificação NOVA (outra `action`) com o gateway ainda `authorized`:
      // passa pela dedup e APLICA o efeito de novo. É este caminho que exercita
      // a barreira real (`UNIQUE (clinic_id, inicio)` + estado já `active`) —
      // sem ele, o caso (a) sozinho provaria só a dedup, não o ciclo.
      respondeStatus("authorized");
      const outra = await POST(
        requisicao({
          dataIdNaUrl: "sub-reentrega",
          corpo: notificacao("sub-reentrega", "payment.created"),
        }),
      );
      expect(outra.status).toBe(200);
      expect(await contarCiclos(clinicId)).toBe(1);
    });

    it("gateway `paused` → past_due; segunda aplicação NÃO recarimba past_due_desde", async () => {
      await novaAssinatura({
        providerSubscriptionId: "sub-pausada",
        status: "active",
      });

      respondeStatus("paused");
      await POST(
        requisicao({
          dataIdNaUrl: "sub-pausada",
          corpo: notificacao("sub-pausada", "updated"),
        }),
      );

      const primeira = await lerAssinatura("sub-pausada");
      expect(primeira.status).toBe("past_due");
      expect(primeira.past_due_desde).not.toBeNull();

      // Segunda notificação (outra `action`, logo não é duplicata) com o gateway
      // ainda pausado. Recarimbar aqui zeraria a carência a cada reentrega e a
      // assinatura nunca venceria.
      respondeStatus("paused");
      await POST(
        requisicao({
          dataIdNaUrl: "sub-pausada",
          corpo: notificacao("sub-pausada", "payment.updated"),
        }),
      );

      const segunda = await lerAssinatura("sub-pausada");
      expect(segunda.status).toBe("past_due");
      expect(segunda.past_due_desde).toStrictEqual(primeira.past_due_desde);
    });

    it("providerSubscriptionId desconhecido → 200 e erro_aplicacao 'assinatura desconhecida'", async () => {
      // Nenhuma linha em `subscription` para este id (TRUNCATE no beforeEach).
      respondeStatus("authorized");

      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-de-outra-conta",
          corpo: notificacao("sub-de-outra-conta", "updated"),
        }),
      );
      expect(res.status).toBe(200);

      const evento = await lerEvento("preapproval:sub-de-outra-conta:updated")!;
      expect(evento!.aplicado_em).not.toBeNull();
      expect(evento!.erro_aplicacao).toBe("assinatura desconhecida");
    });

    it("falha na consulta ao gateway → 200, aplicado_em NULL e erro_aplicacao com o texto real", async () => {
      await novaAssinatura({ providerSubscriptionId: "sub-gateway-fora" });
      respondeErroDeRede("ECONNRESET simulado no dublê do gateway");

      const res = await POST(
        requisicao({
          dataIdNaUrl: "sub-gateway-fora",
          corpo: notificacao("sub-gateway-fora", "updated"),
        }),
      );
      // 200 mesmo com o efeito não aplicado: o MP desabilita endpoint que
      // devolve erro, e a entrega já está durável.
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      const evento = await lerEvento("preapproval:sub-gateway-fora:updated")!;
      expect(evento!.aplicado_em).toBeNull();
      expect(evento!.erro_aplicacao).toBe(
        "ECONNRESET simulado no dublê do gateway",
      );

      // Estado local intocado — nada foi inventado a partir do payload.
      const assinatura = await lerAssinatura("sub-gateway-fora");
      expect(assinatura.status).toBe("setup_pending");
    });
  });

  // ── Varredura de pendentes ─────────────────────────────────────────────────

  describe("reprocessarEventosPendentes", () => {
    /**
     * A distinção que estes testes protegem: recusa DEFINITIVA do gateway (4xx)
     * nunca melhora com retry, então a linha tem que sair da fila. Falha
     * TRANSITÓRIA (rede, timeout, 5xx) tem que continuar nela — é exatamente o
     * caso que a varredura existe para recuperar.
     *
     * O oráculo de "saiu da fila" é a AUSÊNCIA de chamada ao gateway na segunda
     * passada, não o valor de uma coluna: a coluna poderia estar preenchida e o
     * `WHERE` continuar selecionando a linha por outro motivo.
     */

    /** Deixa um evento gravado e PENDENTE, com o gateway falhando no POST. */
    async function eventoPendente(
      subId: string,
      falha: () => void,
    ): Promise<string> {
      await novaAssinatura({ providerSubscriptionId: subId });
      falha();
      const res = await POST(
        requisicao({
          dataIdNaUrl: subId,
          corpo: notificacao(subId, "updated"),
        }),
      );
      expect(res.status).toBe(200);
      const chave = `preapproval:${subId}:updated`;
      expect((await lerEvento(chave))!.aplicado_em).toBeNull();
      return chave;
    }

    it("404 do gateway: carimba aplicado_em e a linha NÃO volta na varredura seguinte", async () => {
      const chave = await eventoPendente("sub-404", () =>
        respondeHttp(404, { message: "preapproval not found" }),
      );

      respondeHttp(404, { message: "preapproval not found" });
      const primeira = await reprocessarEventosPendentes();
      expect(primeira).toEqual({ aplicados: 0, falhas: 1 });

      const depois = await lerEvento(chave)!;
      expect(depois!.aplicado_em).not.toBeNull();
      expect(depois!.erro_aplicacao).toContain("404");

      // Nenhuma resposta enfileirada para a 2ª passada: se a linha ainda fosse
      // selecionada, o dublê estouraria "fetch inesperado" e o teste ficaria
      // vermelho. É esta ausência que prova que o loop acabou.
      const chamadasAntes = chamadasGateway.length;
      const segunda = await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(chamadasAntes);
      expect(segunda).toEqual({ aplicados: 0, falhas: 0 });
    });

    it("erro de rede: continua pendente e a linha VOLTA na varredura seguinte", async () => {
      const chave = await eventoPendente("sub-rede", () =>
        respondeErroDeRede("ETIMEDOUT simulado"),
      );

      respondeErroDeRede("ETIMEDOUT simulado");
      await reprocessarEventosPendentes();
      expect((await lerEvento(chave))!.aplicado_em).toBeNull();

      // A 2ª passada TEM que consumir uma resposta — ou seja, tem que ter
      // selecionado a linha de novo.
      const chamadasAntes = chamadasGateway.length;
      respondeErroDeRede("ETIMEDOUT simulado");
      const segunda = await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(chamadasAntes + 1);
      expect(segunda).toEqual({ aplicados: 0, falhas: 1 });
      expect((await lerEvento(chave))!.aplicado_em).toBeNull();
    });

    it("500 do gateway: continua pendente e a linha VOLTA na varredura seguinte", async () => {
      const chave = await eventoPendente("sub-500", () => respondeHttp(500));

      respondeHttp(500);
      await reprocessarEventosPendentes();
      expect((await lerEvento(chave))!.aplicado_em).toBeNull();

      const chamadasAntes = chamadasGateway.length;
      respondeHttp(500);
      await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(chamadasAntes + 1);
      expect((await lerEvento(chave))!.aplicado_em).toBeNull();
    });

    /**
     * Nem todo 4xx é definitivo. 401 (token rotacionado/expirado), 408 e 429
     * (rate limit) são transitórios na prática — e são justamente os que
     * chegam em LOTE. Tratá-los como definitivos carimbaria uma leva inteira de
     * eventos legítimos como aplicados, e eles nunca mais entrariam na fila:
     * perda de faturamento silenciosa, o pior modo de falha possível aqui.
     *
     * O oráculo é o mesmo dos transitórios: a segunda varredura TEM que
     * consumir uma resposta do dublê — ou seja, tem que ter selecionado a linha
     * de novo. Asserir só `aplicado_em IS NULL` seria mais fraco: a coluna podia
     * estar NULL e o `WHERE` deixar de selecionar por outro motivo.
     */
    it.each([401, 408, 429])(
      "%i do gateway é transitório apesar de 4xx: continua pendente e VOLTA na varredura seguinte",
      async (status) => {
        const chave = await eventoPendente(`sub-${status}`, () =>
          respondeHttp(status),
        );

        respondeHttp(status);
        await reprocessarEventosPendentes();
        expect((await lerEvento(chave))!.aplicado_em).toBeNull();

        const chamadasAntes = chamadasGateway.length;
        respondeHttp(status);
        const segunda = await reprocessarEventosPendentes();
        expect(chamadasGateway.length).toBe(chamadasAntes + 1);
        expect(segunda).toEqual({ aplicados: 0, falhas: 1 });
        expect((await lerEvento(chave))!.aplicado_em).toBeNull();
        // O motivo fica registrado mesmo continuando pendente — sem isso o
        // operador não distingue "na fila porque falhou" de "nunca tentado".
        expect((await lerEvento(chave))!.erro_aplicacao).toContain(
          String(status),
        );
      },
    );

    it.each([400, 403, 404, 422])(
      "%i do gateway continua DEFINITIVO: sai da fila (sem regressão do fix anterior)",
      async (status) => {
        const chave = await eventoPendente(`sub-def-${status}`, () =>
          respondeHttp(status),
        );

        respondeHttp(status);
        await reprocessarEventosPendentes();
        expect((await lerEvento(chave))!.aplicado_em).not.toBeNull();

        // Nenhuma resposta enfileirada: se a linha voltasse, o dublê estouraria.
        const chamadasAntes = chamadasGateway.length;
        const segunda = await reprocessarEventosPendentes();
        expect(chamadasGateway.length).toBe(chamadasAntes);
        expect(segunda).toEqual({ aplicados: 0, falhas: 0 });
      },
    );

    it("recuperação real: pendente por rede é aplicado quando o gateway volta", async () => {
      // Sem este caso, os três acima seriam compatíveis com uma varredura que
      // nunca aplica nada.
      const chave = await eventoPendente("sub-recupera", () =>
        respondeErroDeRede("ECONNRESET simulado"),
      );

      respondeStatus("authorized");
      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });

      const depois = await lerEvento(chave)!;
      expect(depois!.aplicado_em).not.toBeNull();
      expect(depois!.erro_aplicacao).toBeNull();
      expect((await lerAssinatura("sub-recupera")).status).toBe("active");
    });
  });
});
