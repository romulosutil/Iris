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
const { iniciarAtivacao } = await import("./subscription");

/**
 * `iniciarAtivacao` × VIRADA DE `BILLING_PROVIDER` (incidente de 10/08/2026).
 *
 * O reaproveitamento de vínculo pendente olhava só `status === 'setup_pending'`.
 * Depois que o trilho ativo virou Asaas, a linha de uma clínica que já tinha
 * tentado ativar no Mercado Pago continuava pendente com um
 * `provider_subscription_id` de **preapproval do MP** — 32 hex sem hífen. O
 * `consultarVinculo` do adapter do Asaas mandava esse id para
 * `GET /pix/automatic/authorizations/{id}`, que não existe naquela conta:
 *
 *   Asaas respondeu 400 em GET /pix/automatic/authorizations/0282b435…
 *
 * O 400 sobe ANTES de qualquer criação, então a clínica ficava travada para
 * sempre: toda tentativa de ativar batia no vínculo velho do gateway velho.
 *
 * O invariante que este arquivo fixa é "vínculo de OUTRO gateway nunca é
 * consultado nem reaproveitado" — e o oráculo é a URL efetivamente chamada, não
 * só a coluna final. Sem asserir a URL, "não consultou o gateway errado" e
 * "consultou e deu certo por acaso" ficam indistinguíveis.
 *
 * ## Por que `.int.test.ts`
 *
 * O que está sob teste é a decisão tomada a partir de uma LINHA de
 * `subscription` (par `provider` × `provider_subscription_id`) e a reescrita
 * dessa linha pelo `onConflictDoUpdate`, tudo sob a role `iris_auth`. Com
 * `authDb` dublado, tanto a leitura do par quanto os grants de UPDATE ficariam
 * invisíveis.
 */

const API_KEY_ASAAS = "chave-api-de-teste-do-asaas-d24";
const BASE_URL_ASAAS = "https://api-sandbox.asaas.com/v3";
const ACCESS_TOKEN_MP = "access-token-de-teste-d24";

/** Formato real de um `preapproval_id` do MP: 32 hex sem hífen. */
const ID_VELHO_DO_MP = "0282b43596914b36a7bda8a8a3d85c57";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/** Clínicas criadas no arquivo, para limpar no final sem varrer a tabela. */
const clinicasCriadas: string[] = [];

async function novaClinica(): Promise<string> {
  const linhas = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica teste troca ${crypto.randomUUID()}`})
    RETURNING id`;
  const id = linhas[0]!.id as string;
  clinicasCriadas.push(id);
  return id;
}

async function semearVinculoPendente(opcoes: {
  provider: "asaas" | "mercado_pago";
  providerSubscriptionId: string;
  checkoutUrl?: string | null;
  pixCopiaECola?: string | null;
  valorAtivacaoCentavos?: number | null;
}): Promise<string> {
  const clinicId = await novaClinica();
  await owner!`
    INSERT INTO subscription
      (clinic_id, status, provider, provider_subscription_id,
       checkout_url, pix_copia_e_cola, valor_ativacao_centavos, ciclo_dias)
    VALUES (
      ${clinicId}, 'setup_pending'::subscription_status,
      ${opcoes.provider}, ${opcoes.providerSubscriptionId},
      ${opcoes.checkoutUrl ?? null}, ${opcoes.pixCopiaECola ?? null},
      ${opcoes.valorAtivacaoCentavos ?? null}, 30
    )`;
  return clinicId;
}

async function lerAssinatura(clinicId: string) {
  const r = await authDb.execute(
    sql`SELECT provider, provider_subscription_id, pix_copia_e_cola,
               valor_ativacao_centavos
        FROM subscription WHERE clinic_id = ${clinicId}`,
  );
  return (
    r as unknown as {
      provider: string;
      provider_subscription_id: string;
      pix_copia_e_cola: string | null;
      valor_ativacao_centavos: number | null;
    }[]
  )[0]!;
}

// ── Dublê do gateway ─────────────────────────────────────────────────────────

const BR_CODE_NOVO = "00020126…iris-d24";
const ID_AUTORIZACAO_NOVA = "53da5204-8dd1-4cf4-9604-d134e1e6fe04";

let chamadasGateway: string[] = [];

/**
 * Responde por URL, não por fila FIFO: a ordem interna das chamadas do adapter
 * (`POST /customers` antes de `POST /pix/automatic/authorizations`) é detalhe
 * dele, e amarrar o teste a essa ordem faria o arquivo quebrar por refactor que
 * não muda comportamento nenhum.
 *
 * A rota do MP existe SÓ para provar a ausência: se o código voltar a consultar
 * o gateway velho, a chamada aparece em `chamadasGateway` em vez de estourar um
 * fetch inesperado que poderia ser confundido com outra falha.
 */
function instalarGateway(): void {
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    chamadasGateway.push(url);

    if (url.includes("/customers")) {
      return Response.json({ id: "cus_000008561913" });
    }
    if (url.includes("/pix/automatic/authorizations")) {
      return Response.json({
        id: ID_AUTORIZACAO_NOVA,
        status: "AWAITING_PAYMENT",
        payload: BR_CODE_NOVO,
        customerId: "cus_000008561913",
      });
    }
    if (url.includes("/preapproval")) {
      return Response.json({ id: ID_VELHO_DO_MP, status: "pending" });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

describe.skipIf(!hasDb)("iniciarAtivacao × troca de BILLING_PROVIDER", () => {
  beforeAll(() => {
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY_ASAAS);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL_ASAAS);
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", ACCESS_TOKEN_MP);
    vi.stubEnv("BILLING_PROVIDER", "asaas");
  });

  beforeEach(async () => {
    chamadasGateway = [];
    instalarGateway();
    await owner!`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (owner) {
      await owner`TRUNCATE billing_cycle, subscription RESTART IDENTITY CASCADE`;
      if (clinicasCriadas.length > 0) {
        await owner`DELETE FROM clinic WHERE id = ANY(${clinicasCriadas}::uuid[])`;
      }
      await owner.end();
    }
    vi.unstubAllEnvs();
  });

  it("vínculo pendente do gateway ANTERIOR não é consultado — cria um novo", async () => {
    const clinicId = await semearVinculoPendente({
      provider: "mercado_pago",
      providerSubscriptionId: ID_VELHO_DO_MP,
      checkoutUrl: "https://mp.example/checkout/velho",
    });

    const r = await iniciarAtivacao({
      clinicId,
      nomeClinica: "Clínica D24",
      emailResponsavel: "coord@example.test",
      cpfCnpj: "29811201000150",
      metodo: "pix",
      urlRetorno: "https://irisclinica.ia.br/assinatura/retorno",
    });

    // O bug em uma linha: o id do MP indo para a URL do Asaas.
    expect(
      chamadasGateway.some((u) =>
        u.includes(`/pix/automatic/authorizations/${ID_VELHO_DO_MP}`),
      ),
    ).toBe(false);
    // E nem o gateway velho foi consultado: vínculo de outro provedor não é
    // reaproveitável, ponto — não é "consulte lá e decida".
    expect(chamadasGateway.some((u) => u.includes("/preapproval"))).toBe(false);

    expect(r.providerSubscriptionId).toBe(ID_AUTORIZACAO_NOVA);
    expect(r.autorizacao).toEqual({
      forma: "pix_copia_e_cola",
      brCode: BR_CODE_NOVO,
      valorAtivacaoCentavos: expect.any(Number),
    });

    // A linha inteira migrou de gateway: `provider` e `provider_subscription_id`
    // reescritos JUNTOS. Um par misto (provider novo, id velho) é o estado que
    // reproduziria o incidente na próxima chamada.
    const linha = await lerAssinatura(clinicId);
    expect(linha.provider).toBe("asaas");
    expect(linha.provider_subscription_id).toBe(ID_AUTORIZACAO_NOVA);
    expect(linha.pix_copia_e_cola).toBe(BR_CODE_NOVO);
  });

  it("vínculo pendente do MESMO gateway continua sendo reaproveitado", async () => {
    // Contraprova: o guard novo não pode ter matado a idempotência que impedia
    // dois cliques no botão de virarem dois vínculos no gateway.
    const clinicId = await semearVinculoPendente({
      provider: "asaas",
      providerSubscriptionId: ID_AUTORIZACAO_NOVA,
      pixCopiaECola: "00020126…br-code-ja-guardado",
      valorAtivacaoCentavos: 100,
    });

    const r = await iniciarAtivacao({
      clinicId,
      nomeClinica: "Clínica D24",
      emailResponsavel: "coord@example.test",
      cpfCnpj: "29811201000150",
      metodo: "pix",
      urlRetorno: "https://irisclinica.ia.br/assinatura/retorno",
    });

    expect(r.providerSubscriptionId).toBe(ID_AUTORIZACAO_NOVA);
    expect(r.autorizacao).toEqual({
      forma: "pix_copia_e_cola",
      brCode: "00020126…br-code-ja-guardado",
      valorAtivacaoCentavos: 100,
    });
    // Consultou o vínculo existente e parou aí: nenhum cliente/autorização novos.
    expect(
      chamadasGateway.filter((u) =>
        u.startsWith(`${BASE_URL_ASAAS}/customers`),
      ),
    ).toHaveLength(0);
    expect(chamadasGateway).toEqual([
      `${BASE_URL_ASAAS}/pix/automatic/authorizations/${ID_AUTORIZACAO_NOVA}`,
    ]);
  });
});
