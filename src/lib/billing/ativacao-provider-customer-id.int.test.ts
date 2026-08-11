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
 * `iniciarAtivacao` × `provider_customer_id` (débito D32).
 *
 * O adapter do Asaas cria DUAS entidades no gateway — o cliente
 * (`POST /customers`) e a autorização de Pix Automático — e até aqui só o id da
 * autorização subia pela porta. O id do cliente era descartado dentro do
 * adapter, e a coluna `subscription.provider_customer_id`, que existe desde a
 * 0071 justamente para guardá-lo, ficava `NULL` para toda clínica ativada. O
 * efeito prático: não havia como reencontrar o cliente já criado — só criar
 * outro, duplicando assinante no gateway a cada reativação.
 *
 * O oráculo é a COLUNA depois da ativação, não o retorno da função: o retorno
 * não expõe o id do cliente (a UI não tem o que fazer com ele), então asserir o
 * resultado deixaria "persistiu" e "passou pela porta e se perdeu no INSERT"
 * indistinguíveis.
 *
 * ## Por que `.int.test.ts`
 *
 * O que está sob teste é uma ESCRITA de coluna sob a role `iris_auth` — tanto o
 * caminho de INSERT quanto o de `onConflictDoUpdate`. Com `authDb` dublado, um
 * grant faltando na coluna (armadilha recorrente deste repo) ficaria invisível,
 * e o teste passaria contra um banco que nega a escrita.
 */

const API_KEY_ASAAS = "chave-api-de-teste-do-asaas-d32";
const BASE_URL_ASAAS = "https://api-sandbox.asaas.com/v3";

const ID_CLIENTE_ASAAS = "cus_000008561913";
const ID_AUTORIZACAO = "9f1b6d20-4c3a-4a41-9f0e-9a2b4e6d1c77";
const BR_CODE = "00020126…iris-d32";

/** Cliente/autorização de uma tentativa ANTERIOR, para o caminho de conflito. */
const ID_CLIENTE_VELHO = "cus_000000000001";
const ID_AUTORIZACAO_VELHA = "1a2b3c4d-0000-4000-8000-000000000001";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/** Clínicas criadas no arquivo, para limpar no final sem varrer a tabela. */
const clinicasCriadas: string[] = [];

async function novaClinica(): Promise<string> {
  const linhas = await owner!`
    INSERT INTO clinic (nome) VALUES (${`Clinica teste D32 ${crypto.randomUUID()}`})
    RETURNING id`;
  const id = linhas[0]!.id as string;
  clinicasCriadas.push(id);
  return id;
}

async function lerAssinatura(clinicId: string) {
  const r = await authDb.execute(
    sql`SELECT provider, provider_subscription_id, provider_customer_id
        FROM subscription WHERE clinic_id = ${clinicId}`,
  );
  return (
    r as unknown as {
      provider: string;
      provider_subscription_id: string;
      provider_customer_id: string | null;
    }[]
  )[0]!;
}

/**
 * Responde por URL, não por fila FIFO — a ordem interna das chamadas do adapter
 * é detalhe dele. `customerId` volta na autorização porque o Asaas real devolve
 * assim; o que o teste fixa é que o id que sobe é o do `POST /customers`.
 */
function instalarGateway(): void {
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    if (url.includes("/customers")) {
      return Response.json({ id: ID_CLIENTE_ASAAS });
    }
    if (url.includes("/pix/automatic/authorizations")) {
      return Response.json({
        id: ID_AUTORIZACAO,
        status: "AWAITING_PAYMENT",
        payload: BR_CODE,
        customerId: ID_CLIENTE_ASAAS,
      });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

const PEDIDO = {
  nomeClinica: "Clínica D32",
  emailResponsavel: "coord@example.test",
  cpfCnpj: "29811201000150",
  metodo: "pix" as const,
  urlRetorno: "https://irisclinica.ia.br/assinatura",
};

describe.skipIf(!hasDb)("iniciarAtivacao × provider_customer_id", () => {
  beforeAll(() => {
    vi.stubEnv("BILLING_PROVIDER_API_KEY", API_KEY_ASAAS);
    vi.stubEnv("ASAAS_BASE_URL", BASE_URL_ASAAS);
    vi.stubEnv("BILLING_PROVIDER", "asaas");
  });

  beforeEach(async () => {
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

  it("INSERT grava o id do cliente do gateway junto com o provedor", async () => {
    const clinicId = await novaClinica();

    const r = await iniciarAtivacao({ clinicId, ...PEDIDO });
    expect(r.providerSubscriptionId).toBe(ID_AUTORIZACAO);

    const linha = await lerAssinatura(clinicId);
    // O bug em uma linha: isto era `null` para toda clínica ativada.
    expect(linha.provider_customer_id).toBe(ID_CLIENTE_ASAAS);
    // Junto com o provedor — o id só faz sentido dentro do gateway que o emitiu.
    expect(linha.provider).toBe("asaas");
    expect(linha.provider_subscription_id).toBe(ID_AUTORIZACAO);
  });

  it("reativação reescreve o id do cliente no conflito, sem deixar o anterior", async () => {
    const clinicId = await novaClinica();
    // Linha de uma tentativa anterior: é o caminho do `onConflictDoUpdate`, e é
    // onde uma coluna esquecida no `set` sobrevive em silêncio com valor velho.
    await owner!`
      INSERT INTO subscription
        (clinic_id, status, provider, provider_subscription_id,
         provider_customer_id, pix_copia_e_cola, valor_ativacao_centavos, ciclo_dias)
      VALUES (
        ${clinicId}, 'setup_pending'::subscription_status,
        'mercado_pago', ${ID_AUTORIZACAO_VELHA},
        ${ID_CLIENTE_VELHO}, '00020126…br-code-velho', 100, 30
      )`;

    await iniciarAtivacao({ clinicId, ...PEDIDO });

    const linha = await lerAssinatura(clinicId);
    expect(linha.provider_customer_id).toBe(ID_CLIENTE_ASAAS);
    expect(linha.provider_customer_id).not.toBe(ID_CLIENTE_VELHO);
    expect(linha.provider).toBe("asaas");
  });
});
