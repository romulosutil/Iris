import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor podem puxar
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { authDb } = await import("@/db/client");
const { POST } = await import("./route");

/**
 * Webhook do Asaas (#36, Fase 7 — Pix Automático).
 *
 * Este arquivo é `.int.test.ts` (roda em `pnpm test:rls`, não em `pnpm test`)
 * porque a garantia central do endpoint — idempotência — NÃO é testável com
 * dublê: ela é o `UNIQUE (asaas_event_id)` do Postgres decidindo a corrida
 * entre duas entregas simultâneas. Um mock de `authDb` passaria verde com um
 * SELECT-then-INSERT nu, que é exatamente o bug que a dedup existe para evitar.
 *
 * Os casos que não tocam banco (401/400) moram aqui junto de propósito: são o
 * mesmo contrato de um mesmo handler, e separá-los em dois arquivos criaria a
 * chance de um deles rodar num ambiente e o outro não.
 */

// Token de teste fixado aqui e não no .env: o `.env` é gitignored, e um teste
// de autenticação que depende de segredo invisível no review vira verde por
// omissão quando a var some.
const TOKEN = "token-de-teste-do-asaas-36";

/**
 * `iris_auth` só tem GRANT de SELECT/INSERT (migração 0066) — de propósito:
 * trilha de webhook não é apagável pelo app. Logo a limpeza do teste precisa
 * da role DONA, igual aos demais .int.test.ts do repo.
 */
// `max: 2` (e não o `max: 1` dos demais .int.test.ts): o teste de corrida
// mantém UMA transação aberta e, ao mesmo tempo, precisa consultar o catálogo
// para saber se o handler já bloqueou. Com pool de 1 a consulta fica presa
// atrás da própria transação e o teste estoura por timeout, não por falha real.
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/** IDs criados no arquivo, para limpar no final sem varrer a tabela toda. */
const idsCriados: string[] = [];

function novoId(): string {
  const id = `evt_teste_${crypto.randomUUID()}`;
  idsCriados.push(id);
  return id;
}

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

async function contarLinhas(asaasEventId: string): Promise<number> {
  const r = await authDb.execute(
    sql`SELECT count(*)::int AS n FROM asaas_webhook_event
        WHERE asaas_event_id = ${asaasEventId}`,
  );
  return (r as unknown as { n: number }[])[0]!.n;
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

describe.skipIf(!hasDb)("POST /api/hooks/asaas", () => {
  beforeAll(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  });

  afterAll(async () => {
    if (owner && idsCriados.length > 0) {
      await owner`DELETE FROM asaas_webhook_event
                  WHERE asaas_event_id = ANY(${idsCriados})`;
    }
    await owner?.end();
  });

  it("401 com token inválido", async () => {
    const res = await POST(
      requisicao({ token: "token-errado", corpo: { id: "x", event: "y" } }),
    );
    expect(res.status).toBe(401);
  });

  it("401 quando o token válido é prefixo do enviado (tamanhos diferentes)", async () => {
    // timingSafeEqual LANÇA com buffers de tamanhos diferentes; se o handler
    // não comparar o tamanho antes, este caso vira 500 (que o Asaas reentrega
    // em loop) em vez de 401.
    const res = await POST(
      requisicao({ token: `${TOKEN}-a-mais`, corpo: { id: "x", event: "y" } }),
    );
    expect(res.status).toBe(401);
  });

  it("401 sem o header", async () => {
    const res = await POST(requisicao({ token: null, corpo: { id: "x" } }));
    expect(res.status).toBe(401);
  });

  it("401 quando ASAAS_WEBHOOK_TOKEN não está configurada", async () => {
    // Nunca "passa porque não há token configurado": sem env, tudo é 401.
    const anterior = process.env.ASAAS_WEBHOOK_TOKEN;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    try {
      const res = await POST(
        requisicao({ token: TOKEN, corpo: { id: "x", event: "y" } }),
      );
      expect(res.status).toBe(401);
    } finally {
      process.env.ASAAS_WEBHOOK_TOKEN = anterior;
    }
  });

  it("401 não revela se o token existe ou não", async () => {
    const semEnv = await (async () => {
      const anterior = process.env.ASAAS_WEBHOOK_TOKEN;
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      const r = await POST(requisicao({ token: TOKEN, corpo: {} }));
      process.env.ASAAS_WEBHOOK_TOKEN = anterior;
      return r.text();
    })();
    const comEnv = await POST(requisicao({ token: "outro", corpo: {} })).then(
      (r) => r.text(),
    );
    expect(semEnv).toBe(comEnv);
  });

  it("400 com corpo JSON malformado (não 500)", async () => {
    const res = await POST(
      requisicao({ token: TOKEN, corpoCru: "{isso não é json" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 quando faltam `event`/`id`", async () => {
    const semEvento = await POST(
      requisicao({ token: TOKEN, corpo: { id: novoId() } }),
    );
    expect(semEvento.status).toBe(400);

    const semId = await POST(
      requisicao({
        token: TOKEN,
        corpo: { event: "PIX_AUTOMATIC_RECURRING_CREATED" },
      }),
    );
    expect(semId.status).toBe(400);
  });

  it("200 e grava o evento com token válido", async () => {
    const id = novoId();
    const res = await POST(
      requisicao({
        token: TOKEN,
        corpo: {
          id,
          event: "PIX_AUTOMATIC_RECURRING_PAYMENT_RECEIVED",
          payment: { value: 199.9 },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(await contarLinhas(id)).toBe(1);

    // O payload BRUTO tem que estar lá: a apuração do valor cobrado só chega
    // com a tabela `subscription` (#159) e vai reprocessar este histórico.
    const r = await authDb.execute(
      sql`SELECT evento, payload FROM asaas_webhook_event
          WHERE asaas_event_id = ${id}`,
    );
    const linha = (
      r as unknown as {
        evento: string;
        payload: { payment: { value: number } };
      }[]
    )[0]!;
    expect(linha.evento).toBe("PIX_AUTOMATIC_RECURRING_PAYMENT_RECEIVED");
    expect(linha.payload.payment.value).toBe(199.9);
  });

  it("idempotência: mesmo id reprocessado responde duplicado e não grava linha nova", async () => {
    const id = novoId();
    const corpo = { id, event: "PIX_AUTOMATIC_RECURRING_PAYMENT_RECEIVED" };

    const primeira = await POST(requisicao({ token: TOKEN, corpo }));
    expect(await primeira.json()).toEqual({ received: true });

    const segunda = await POST(requisicao({ token: TOKEN, corpo }));
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ received: true, duplicado: true });

    expect(await contarLinhas(id)).toBe(1);
  });

  it("idempotência sob corrida: entrega concorrente ainda não commitada", async () => {
    /**
     * Este é o teste que de fato PROVA a dedup atômica — e ele existe porque a
     * versão óbvia NÃO provava nada.
     *
     * Primeiro tentei `Promise.all([POST, POST, POST])`. Verifiquei por mutação:
     * trocando o handler por um SELECT-then-INSERT nu, aquele teste continuava
     * VERDE (o pool do postgres.js serializa o suficiente para a 1ª gravação
     * commitar antes da 2ª leitura). Verde que passa com o bug presente não é
     * cobertura — é o padrão "teste verde que não testa nada".
     *
     * Aqui a corrida é FORÇADA e determinística: a role dona abre uma transação,
     * insere a linha e NÃO commita. Nesse estado:
     *   - SELECT-then-INSERT: o SELECT não enxerga a linha não-commitada, o
     *     INSERT bloqueia e, no COMMIT do outro lado, estoura 23505 → 500 (e o
     *     Asaas reentrega em loop).
     *   - INSERT ... ON CONFLICT DO NOTHING: bloqueia igual, mas no COMMIT
     *     resolve para "nada inserido" → 200 duplicado, sem erro.
     */
    const id = novoId();
    const corpo = { id, event: "PIX_AUTOMATIC_RECURRING_CREATED" };

    let liberar!: () => void;
    const podeCommitar = new Promise<void>((r) => (liberar = r));
    let jaInseriu!: () => void;
    const linhaSegurada = new Promise<void>((r) => (jaInseriu = r));

    // Transação concorrente segurando a linha (mesma role dona da limpeza).
    const transacaoConcorrente = owner!.begin(async (tx) => {
      await tx`INSERT INTO asaas_webhook_event (asaas_event_id, evento, payload)
               VALUES (${id}, ${corpo.event}, ${owner!.json(corpo)})`;
      jaInseriu();
      await podeCommitar;
    });

    // Só dispara o handler DEPOIS que a linha está de fato segurada: sem isso o
    // handler ganha a corrida, commita primeiro, e quem estoura 23505 é a
    // transação do teste — a corrida que queremos exercer nunca acontece.
    await linhaSegurada;

    // Handler dispara e vai BLOQUEAR no INSERT (a linha existe, não commitada).
    const resposta = POST(requisicao({ token: TOKEN, corpo }));

    // Espera o bloqueio de fato acontecer — sem sleep arbitrário: consultamos o
    // catálogo até ver a sessão do handler esperando por lock.
    await esperaBloqueio();

    liberar();
    await transacaoConcorrente;

    const res = await resposta;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicado: true });
    expect(await contarLinhas(id)).toBe(1);
  });

  it("evento desconhecido é registrado e responde 200 (nunca 500)", async () => {
    // 500 em evento que não sabemos tratar vira loop de reentrega no Asaas.
    const id = novoId();
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
