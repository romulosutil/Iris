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
import {
  BASE_URL_FAKE,
  ID_PROVEDOR_FAKE,
  ProvedorFake,
} from "@tests/provedor-fake";

vi.mock("server-only", () => ({}));

vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { fecharCiclosVencendo } = await import("./subscription");

/**
 * #36, A3/A4 — a URL da fatura é PERSISTIDA na emissão.
 *
 * O adapter já devolvia `CobrancaEmitida.urlPagamento` e o `UPDATE` de
 * fechamento a descartava. Os dois casos abaixo são a régua:
 *
 * 1. **o valor gravado é o que SAIU do gateway** — relido pela conexão dona, e
 *    não inferido do retorno da função;
 * 2. **gateway sem URL não derruba o fechamento** — grava `NULL` e a cobrança
 *    sai igual. É o caso que mais importa: sem ele, trocar o `?? null` por um
 *    `throw` passaria despercebido até quebrar uma cobrança real.
 */

const CLINICA = "00000000-0000-0000-0000-0000003600f1";
const SUB = "00000000-0000-0000-0000-0000003600f2";
const PACIENTE = "00000000-0000-0000-0000-0000003600f3";
const VINCULO = "vinc_fake_invoice_url";
const ID_COBRANCA = "cob_fake_invoice_url";
const URL_FATURA = "https://gateway-fake.test/i/36a4";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

/**
 * Limpeza por DELETE escopado, nunca `TRUNCATE`: os int-tests de billing rodam
 * em paralelo e um `TRUNCATE` de tabela compartilhada derruba os vizinhos.
 */
async function limpar() {
  await owner!`DELETE FROM billing_cycle_patient WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM audit_log WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM subscription WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM patient WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
}

/** Assinatura ativa com o ciclo já vencido — o que a varredura seleciona. */
async function semearVencida() {
  await owner!`INSERT INTO clinic (id, nome, is_demo)
    VALUES (${CLINICA}, 'Clinica invoice_url', false)`;
  await owner!`INSERT INTO subscription
    (id, clinic_id, status, provider, provider_subscription_id,
     ciclo_atual_inicio, ciclo_atual_fim, ciclo_dias, ativada_em)
    VALUES (${SUB}, ${CLINICA}, 'active', ${ID_PROVEDOR_FAKE}, ${VINCULO},
     '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 30,
     '2026-06-01T00:00:00Z')`;
  // Ficha criada DENTRO do ciclo: ciclo de valor zero é fechado sem tocar o
  // gateway, e o teste passaria verde sem ter emitido nada.
  await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em)
    VALUES (${PACIENTE}, ${CLINICA}, 'Paciente do ciclo',
     '2026-06-10T00:00:00Z')`;
  await owner!`INSERT INTO billing_cycle
    (clinic_id, subscription_id, inicio, fim, status,
     pacientes_contados, valor_centavos)
    VALUES (${CLINICA}, ${SUB},
     '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 'aberto', 0, 0)`;
}

/** `urlDaFatura: null` reproduz o gateway que responde sem `invoiceUrl`. */
function instalarGateway(opcoes: { urlDaFatura: string | null }): void {
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    if (url.startsWith(`${BASE_URL_FAKE}/cobrancas`)) {
      return Response.json({
        id: ID_COBRANCA,
        estado: "PENDENTE",
        ...(opcoes.urlDaFatura ? { urlPagamento: opcoes.urlDaFatura } : {}),
      });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

async function cicloFechado() {
  const [linha] = await owner!`
    SELECT status, provider_charge_id, invoice_url
      FROM billing_cycle
     WHERE clinic_id = ${CLINICA} AND fim = '2026-07-01T00:00:00Z'`;
  return linha;
}

describe.skipIf(!hasDb)("fecharCiclosVencendo grava a URL da fatura", () => {
  beforeAll(() => {
    vi.stubEnv("BILLING_PROVIDER", ID_PROVEDOR_FAKE);
  });

  beforeEach(async () => {
    await limpar();
    await semearVencida();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await limpar();
    await owner?.end();
  });

  it("persiste exatamente a URL que o gateway devolveu", async () => {
    instalarGateway({ urlDaFatura: URL_FATURA });
    await fecharCiclosVencendo({ agora: new Date("2026-07-02T03:00:00Z") });

    const ciclo = await cicloFechado();
    expect(ciclo?.provider_charge_id).toBe(ID_COBRANCA);
    expect(ciclo?.invoice_url).toBe(URL_FATURA);
  });

  it("grava NULL e fecha o ciclo mesmo assim quando o gateway não devolve URL", async () => {
    instalarGateway({ urlDaFatura: null });
    await fecharCiclosVencendo({ agora: new Date("2026-07-02T03:00:00Z") });

    const ciclo = await cicloFechado();
    expect(ciclo?.invoice_url).toBeNull();
    // A cobrança saiu do mesmo jeito: link de conveniência ausente não pode
    // derrubar um fechamento de ciclo.
    expect(ciclo?.provider_charge_id).toBe(ID_COBRANCA);
    expect(ciclo?.status).toBe("aguardando_pagamento");
  });
});
