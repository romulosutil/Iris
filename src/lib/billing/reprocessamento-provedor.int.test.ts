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
 * Varredura de pendentes × PROVEDOR ATIVO (#36, Fase 7).
 *
 * `reprocessarEventosPendentes()` deixou de olhar só `mercadopago_webhook_event`
 * e passou a varrer **os DOIS trilhos**, cada tabela com o adapter DELA,
 * independentemente de `BILLING_PROVIDER` (revisão do Jules no PR #232). Este
 * arquivo é o teste dessa generalização.
 *
 * A versão anterior deste arquivo asseria o invariante intermediário — "a tabela
 * do provedor INATIVO fica intocada". Ele estava errado: `subscription.provider`
 * é persistido por linha, então depois de uma virada de chave as assinaturas
 * antigas continuam amarradas ao gateway de origem e continuam entregando
 * webhook. Varrer só a tabela do provedor ativo deixava uma falha transitória
 * naquela rota encalhada para sempre — exatamente o caso que a varredura existe
 * para recuperar.
 *
 * O invariante NOVO é mais forte e continua cobrindo o risco original, que nunca
 * foi "não olhe a outra tabela" e sim **"não cruze tabela com adapter"**: o
 * adapter errado normalizaria payload de outro dialeto e consultaria ids que não
 * existem na API dele; o 404 resultante é classificado como recusa DEFINITIVA e
 * carimbaria `aplicado_em` num evento legítimo — perda silenciosa de
 * faturamento, o pior modo de falha possível aqui. Daí o teste do par
 * tabela↔adapter asserir sobre as URLs efetivamente chamadas, e não só sobre as
 * colunas: a coluna certa pode ter sido escrita pelo caminho errado.
 *
 * ## Por que `.int.test.ts` (roda em `pnpm test:rls`, não em `pnpm test`)
 *
 * Tudo que se quer provar é do BANCO: qual tabela o `SELECT` visitou, e se o
 * `UPDATE` de `aplicado_em`/`erro_aplicacao` passa sob a role `iris_auth`. Com
 * `authDb` dublado, "varreu a tabela errada" e "não tem grant de UPDATE" ficam
 * os dois invisíveis.
 *
 * ## Prova de grant (migração 0086)
 *
 * A 0066 dava só SELECT/INSERT em `asaas_webhook_event`; a 0086 acrescentou
 * UPDATE coluna a coluna de `aplicado_em`/`erro_aplicacao`. Não há teste
 * separado para isso de propósito: `reprocessarEventosPendentes` roda inteira
 * em `authDb` (= conexão de `iris_auth`), então TODO caso deste arquivo que
 * asserta `aplicado_em not null` ou `erro_aplicacao` preenchido já exercita o
 * grant — sem ele o UPDATE estouraria `permission denied for table
 * asaas_webhook_event` e os testes ficariam vermelhos. Duplicar seria testar a
 * mesma coisa duas vezes.
 *
 * ## Dublê do gateway
 *
 * Só `vi.stubGlobal("fetch", …)`. Nada de mockar a classe do provider: é
 * justamente o `normalizarEvento` de cada adapter, e a URL que cada um monta,
 * que este arquivo usa como oráculo de "qual provedor foi acionado".
 */

const TOKEN_ASAAS = "token-de-teste-do-asaas-36";
const API_KEY_ASAAS = "chave-api-de-teste-do-asaas-36";
const BASE_URL_ASAAS = "https://api-sandbox.asaas.com/v3";
const ACCESS_TOKEN_MP = "access-token-de-teste-36";
const SEGREDO_MP = "segredo-de-teste-do-mercadopago-36";

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
  provider: "asaas" | "mercado_pago";
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

// ── Semeadura de entregas PENDENTES ──────────────────────────────────────────
//
// As linhas são inseridas direto pela role dona, sem passar pela rota: o que
// está sob teste é a VARREDURA, e fazer o setup pelo webhook amarraria este
// arquivo ao handler HTTP (que já tem os seus próprios .int.test.ts).

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

/** Notificação típica do MP: `{type, action, data:{id}}`. */
function payloadMp(subId: string) {
  return { type: "preapproval", action: "updated", data: { id: subId } };
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

async function semearMpPendente(subId: string): Promise<string> {
  const chave = `preapproval:${subId}:updated`;
  await owner!`
    INSERT INTO mercadopago_webhook_event (provider_event_id, evento, payload)
    VALUES (${chave}, 'preapproval', ${owner!.json(payloadMp(subId) as never)})`;
  return chave;
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

async function lerMp(chave: string) {
  const r = await authDb.execute(
    sql`SELECT aplicado_em, erro_aplicacao FROM mercadopago_webhook_event
        WHERE provider_event_id = ${chave}`,
  );
  return (
    r as unknown as { aplicado_em: unknown; erro_aplicacao: string | null }[]
  )[0]!;
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

/** Fila de respostas do `fetch`. Cada chamada consome uma. */
let respostasGateway: Array<() => Promise<Response>> = [];
let chamadasGateway: string[] = [];

/**
 * Respostas roteadas por URL (não consumíveis), consultadas ANTES da fila.
 *
 * Existem por causa dos testes de dois trilhos: uma fila FIFO obrigaria o teste
 * a enfileirar as respostas na ordem em que a produção visita as tabelas — ou
 * seja, a codificar a ordem do laço. O teste passaria a quebrar (ou, pior, a
 * responder o corpo do Asaas para uma chamada do MP) só porque a ordem mudou,
 * que é detalhe interno. Roteando por URL, o dublê responde certo em qualquer
 * ordem, e a ordem deixa de ser afirmada onde ela não importa.
 */
let rotasGateway: Array<{
  casa: (url: string) => boolean;
  responde: () => Promise<Response>;
}> = [];

/** Roteia qualquer `GET /pix/automatic/authorizations/*` do Asaas. */
function rotaAutorizacaoAsaas(status = "ACTIVE") {
  rotasGateway.push({
    casa: (url) => url.includes("/pix/automatic/authorizations/"),
    responde: async () => Response.json({ id: "auth-dublê", status, value: null }),
  });
}

/** Roteia qualquer `GET /preapproval/*` do Mercado Pago. */
function rotaVinculoMp(status = "authorized") {
  rotasGateway.push({
    casa: (url) => url.includes("/preapproval/"),
    responde: async () =>
      Response.json({
        id: "preapproval-dublê",
        status,
        auto_recurring: { transaction_amount: 39, currency_id: "BRL" },
      }),
  });
}

/** `GET /pix/automatic/authorizations/{id}` do Asaas. */
function respondeAutorizacaoAsaas(status = "ACTIVE") {
  respostasGateway.push(async () =>
    Response.json({ id: "auth-dublê", status, value: null }),
  );
}

/** `GET /preapproval/{id}` do Mercado Pago. */
function respondeVinculoMp(status = "authorized") {
  respostasGateway.push(async () =>
    Response.json({
      id: "preapproval-dublê",
      status,
      auto_recurring: { transaction_amount: 39, currency_id: "BRL" },
    }),
  );
}

function respondeHttp(status: number, corpo: unknown = { errors: [] }) {
  respostasGateway.push(async () => Response.json(corpo, { status }));
}

function respondeErroDeRede(mensagem: string) {
  respostasGateway.push(async () => {
    throw new Error(mensagem);
  });
}

describe.skipIf(!hasDb)("reprocessarEventosPendentes × trilhos", () => {
  beforeAll(() => {
    // Env dos DOIS adapters ligada o tempo todo: os dois trilhos são varridos
    // sempre, então os dois precisam conseguir falar com o gateway deles. Se a
    // varredura dependesse de qual chave está configurada, "varre os dois"
    // passaria por acidente num ambiente e falharia em outro.
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN_ASAAS);
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY_ASAAS);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL_ASAAS);
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", ACCESS_TOKEN_MP);
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SEGREDO_MP);
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

    await owner!`TRUNCATE billing_cycle, subscription,
                          asaas_webhook_event, mercadopago_webhook_event
                 RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await owner`TRUNCATE billing_cycle, subscription,
                           asaas_webhook_event, mercadopago_webhook_event
                  RESTART IDENTITY CASCADE`;
      if (clinicasCriadas.length > 0) {
        await owner`DELETE FROM clinic WHERE id = ANY(${clinicasCriadas}::uuid[])`;
      }
      await owner.end();
    }
    vi.unstubAllEnvs();
  });

  // ── Seleção pela tabela do provedor ATIVO ──────────────────────────────────

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
      // Este `not.toBeNull()` é, ao mesmo tempo, a prova do grant de UPDATE da
      // 0086: sem ele o `authDb.update` teria estourado `permission denied`.
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toBeNull();

      // Foi o adapter do ASAAS que rodou — a URL prova qual. Um oráculo baseado
      // só na coluna não distinguiria "aplicou pelo adapter certo" de "aplicou
      // pelo errado e deu certo por acaso".
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain(
        `${BASE_URL_ASAAS}/pix/automatic/authorizations/${authId}`,
      );
    });

    it("TAMBÉM aplica o pendente de `mercadopago_webhook_event` (caso central)", async () => {
      // `BILLING_PROVIDER=asaas` não isenta o trilho do MP: assinaturas antigas
      // continuam amarradas ao gateway de origem e a varredura precisa
      // continuar entregando para elas. Cada tabela usa o adapter DELA
      // (`MercadoPagoProvider` para esta linha), nunca o provider ativo na env.
      await novaAssinatura({
        providerSubscriptionId: "sub-do-mp",
        provider: "mercado_pago",
      });
      const chaveMp = await semearMpPendente("sub-do-mp");

      rotaVinculoMp("authorized");
      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 1, falhas: 0 });
      expect(chamadasGateway).toHaveLength(1);
      expect(chamadasGateway[0]).toContain("/preapproval/sub-do-mp");

      const depois = await lerMp(chaveMp);
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toBeNull();
    });

    it("com pendentes nas DUAS tabelas, as DUAS são consumidas — cada uma com o adapter dela", async () => {
      // Variante com as duas linhas presentes ao mesmo tempo: é o estado real de
      // uma virada de provedor. As respostas são roteadas por URL (não por fila
      // FIFO) porque a ordem em que o laço visita os trilhos é detalhe interno.
      const authId = "auth-da-virada";
      await novaAssinatura({
        providerSubscriptionId: authId,
        provider: "asaas",
      });
      await novaAssinatura({
        providerSubscriptionId: "sub-mp-da-virada",
        provider: "mercado_pago",
      });
      const idAsaas = await semearAsaasPendente(authId);
      const chaveMp = await semearMpPendente("sub-mp-da-virada");

      rotaAutorizacaoAsaas("ACTIVE");
      rotaVinculoMp("authorized");
      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 2, falhas: 0 });

      expect((await lerAsaas(idAsaas)).aplicado_em).not.toBeNull();
      expect((await lerMp(chaveMp)).aplicado_em).not.toBeNull();
      expect(chamadasGateway).toHaveLength(2);
      expect(
        chamadasGateway.some((u) => u.includes(BASE_URL_ASAAS)),
      ).toBe(true);
      expect(
        chamadasGateway.some((u) => u.includes("/preapproval/sub-mp-da-virada")),
      ).toBe(true);
    });

    it("evento Asaas sem id utilizável carimba 'sem id utilizável' (não fica na fila para sempre)", async () => {
      // `..._ELIGIBILITY_UPDATED` é sobre a CONTA: não tem `payment` nem
      // `authorization`. Deixá-lo pendente faria a varredura reprocessá-lo em
      // toda passada, para sempre, ocupando o `limit` que serve a eventos novos.
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
      // Não conta como aplicado nem como falha: é um no-op deliberado.
      expect(r).toEqual({ aplicados: 0, falhas: 0 });
      // E sem consultar o gateway: não há id para consultar.
      expect(chamadasGateway).toHaveLength(0);

      const depois = await lerAsaas(idEvento);
      expect(depois.aplicado_em).not.toBeNull();
      expect(depois.erro_aplicacao).toBe("sem id utilizável");
    });

    // ── Definitivo × transitório, no dialeto do Asaas ───────────────────────
    //
    // O oráculo de "saiu da fila" é a AUSÊNCIA (ou presença) de chamada ao
    // gateway na segunda passada, não o valor de uma coluna: a coluna poderia
    // estar preenchida e o `WHERE` continuar selecionando a linha por outro
    // motivo.

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

      // Nada enfileirado para a 2ª passada: se a linha voltasse, o dublê
      // estouraria "fetch inesperado".
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

        // A 2ª passada TEM que consumir uma resposta — ou seja, tem que ter
        // selecionado a linha de novo.
        const antes = chamadasGateway.length;
        respondeHttp(status);
        const segunda = await reprocessarEventosPendentes();
        expect(chamadasGateway.length).toBe(antes + 1);
        expect(segunda).toEqual({ aplicados: 0, falhas: 1 });

        const depois = await lerAsaas(idEvento);
        expect(depois.aplicado_em).toBeNull();
        // O motivo fica registrado mesmo continuando pendente — sem isso o
        // operador não distingue "na fila porque falhou" de "nunca tentado".
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

      // E recupera de verdade quando o gateway volta — sem este par, os casos
      // acima seriam compatíveis com uma varredura que nunca aplica nada.
      const antes = chamadasGateway.length;
      respondeAutorizacaoAsaas("ACTIVE");
      const segunda = await reprocessarEventosPendentes();
      expect(chamadasGateway.length).toBe(antes + 1);
      expect(segunda).toEqual({ aplicados: 1, falhas: 0 });
      expect((await lerAsaas(idEvento)).aplicado_em).not.toBeNull();
    });
  });

  // ── O simétrico ────────────────────────────────────────────────────────────

  describe("BILLING_PROVIDER=mercado_pago", () => {
    beforeEach(() => {
      vi.stubEnv("BILLING_PROVIDER", "mercado_pago");
    });

    it("aplica o pendente do MP e o do Asaas, mesmo com BILLING_PROVIDER=mercado_pago", async () => {
      // Simétrico do caso central: `BILLING_PROVIDER` não isenta o trilho do
      // Asaas. Sem isso, uma varredura que fixasse na tabela do MP (o erro
      // espelhado) passaria em tudo que está acima.
      await novaAssinatura({
        providerSubscriptionId: "sub-mp-ativo",
        provider: "mercado_pago",
      });
      await novaAssinatura({
        providerSubscriptionId: "auth-asaas-parada",
        provider: "asaas",
      });
      const chaveMp = await semearMpPendente("sub-mp-ativo");
      const idAsaas = await semearAsaasPendente("auth-asaas-parada");

      rotaVinculoMp("authorized");
      rotaAutorizacaoAsaas("ACTIVE");
      const r = await reprocessarEventosPendentes();
      expect(r).toEqual({ aplicados: 2, falhas: 0 });

      expect((await lerMp(chaveMp)).aplicado_em).not.toBeNull();
      expect((await lerMp(chaveMp)).erro_aplicacao).toBeNull();
      expect((await lerAsaas(idAsaas)).aplicado_em).not.toBeNull();
      expect((await lerAsaas(idAsaas)).erro_aplicacao).toBeNull();

      expect(chamadasGateway).toHaveLength(2);
      expect(
        chamadasGateway.some((u) => u.includes("/preapproval/sub-mp-ativo")),
      ).toBe(true);
      expect(chamadasGateway.some((u) => u.includes(BASE_URL_ASAAS))).toBe(
        true,
      );
    });
  });
});
