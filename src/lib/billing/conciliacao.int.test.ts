import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { conciliarCiclos, TETO_CONCILIACAO_POR_PASSADA } =
  await import("./conciliacao");
const { BillingProviderError } = await import("./provider/types");

const describeSeDb = hasDb ? describe : describe.skip;

const CLINICA = "00000000-0000-0000-0000-000000375a01";
const SUB = "00000000-0000-0000-0000-000000375b01";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

async function criarAssinatura(): Promise<void> {
  await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINICA}, 'Clínica #375')`;
  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id, provider_customer_id)
    VALUES (${SUB}, ${CLINICA}, 'active'::subscription_status, 'asaas', 'vinc-375', 'cli-375')`;
}

async function criarCiclo(opcoes: {
  status: string;
  valorCentavos: number;
  providerChargeId: string | null;
  emitidaEm?: Date | null;
}): Promise<string> {
  // `billing_cycle_clinic_inicio_uq` é UNIQUE(clinic_id, inicio): mais de um
  // ciclo por teste exige `inicio` distinto, então cada chamada avança um mês.
  const inicio = new Date(Date.UTC(2026, 6 + proximoOffsetDeCiclo++, 1));
  const fim = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0),
  );
  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       provider_charge_id, cobranca_emitida_em)
    VALUES (
      ${CLINICA}, ${SUB},
      ${inicio}, ${fim},
      ${opcoes.status}::billing_cycle_status, ${opcoes.valorCentavos},
      ${opcoes.providerChargeId}, ${opcoes.emitidaEm ?? new Date()}
    )
    RETURNING id`) as unknown as { id: string }[];
  return linhas[0]!.id;
}
let proximoOffsetDeCiclo = 0;

async function limpar(): Promise<void> {
  // DELETE escopado, nunca TRUNCATE: os .int.test.ts rodam em paralelo e um
  // TRUNCATE aqui vira deadlock e violação de FK em suíte alheia.
  await owner!`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM subscription WHERE clinic_id = ${CLINICA}`;
  await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
}

/** Dublê de provedor: objeto literal, não classe — nada aqui é `new`-ado. */
function provedorFake(
  mapa: Record<
    string,
    { status: string; valorCentavos: number } | "404" | Error
  >,
) {
  return {
    async consultarCobranca(id: string) {
      const r = mapa[id];
      if (r === undefined || r === "404") {
        throw new BillingProviderError(
          `Asaas respondeu 404 em GET /payments/${id}`,
          { status: 404, corpo: null },
        );
      }
      if (r instanceof Error) throw r;
      return r as { status: never; valorCentavos: number };
    },
    async consultarVinculo() {
      throw new Error("não usado nesta suíte");
    },
  };
}

describeSeDb("conciliarCiclos", () => {
  beforeEach(async () => {
    await limpar();
    await criarAssinatura();
  });
  afterAll(async () => {
    if (owner) {
      await limpar();
      await owner.end();
    }
  });

  it("não acusa nada quando local e gateway concordam", async () => {
    await criarCiclo({
      status: "pago",
      valorCentavos: 10_000,
      providerChargeId: "pay-ok",
    });
    const r = await conciliarCiclos({
      provider: provedorFake({
        "pay-ok": { status: "paga", valorCentavos: 10_000 },
      }) as never,
    });
    expect(r.conferidos).toBe(1);
    expect(r.divergencias).toEqual([]);
    expect(r.falhas).toEqual([]);
    expect(r.truncado).toBe(false);
  });

  it("acusa pagamento não conciliado com os dois lados na linha", async () => {
    const id = await criarCiclo({
      status: "aguardando_pagamento",
      valorCentavos: 10_000,
      providerChargeId: "pay-perdido",
    });
    const r = await conciliarCiclos({
      provider: provedorFake({
        "pay-perdido": { status: "paga", valorCentavos: 10_000 },
      }) as never,
    });
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      cicloId: id,
      clinicId: CLINICA,
      providerChargeId: "pay-perdido",
      classe: "pagamento_nao_conciliado",
      statusLocal: "aguardando_pagamento",
      statusRemoto: "paga",
      valorLocalCentavos: 10_000,
      valorRemotoCentavos: 10_000,
    });
  });

  it("404 do gateway vira divergência, não falha de consulta", async () => {
    await criarCiclo({
      status: "pago",
      valorCentavos: 10_000,
      providerChargeId: "pay-sumida",
    });
    const r = await conciliarCiclos({ provider: provedorFake({}) as never });
    expect(r.falhas).toEqual([]);
    expect(r.divergencias[0]).toMatchObject({
      classe: "cobranca_inexistente_no_gateway",
      statusRemoto: null,
      valorRemotoCentavos: null,
    });
  });

  it("erro que NÃO é 404 vira falha isolada e não derruba a passada", async () => {
    await criarCiclo({
      status: "pago",
      valorCentavos: 10_000,
      providerChargeId: "pay-500",
    });
    await criarCiclo({
      status: "pago",
      valorCentavos: 20_000,
      providerChargeId: "pay-ok2",
    });
    const r = await conciliarCiclos({
      provider: provedorFake({
        "pay-500": new BillingProviderError("Asaas respondeu 500", {
          status: 500,
          corpo: null,
        }),
        "pay-ok2": { status: "paga", valorCentavos: 20_000 },
      }) as never,
    });
    expect(r.conferidos).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]!.providerChargeId).toBe("pay-500");
    expect(r.divergencias).toEqual([]);
  });

  it("ciclo sem provider_charge_id NUNCA entra na varredura", async () => {
    await criarCiclo({
      status: "aberto",
      valorCentavos: 0,
      providerChargeId: null,
    });
    await criarCiclo({
      status: "apurado",
      valorCentavos: 5_000,
      providerChargeId: null,
    });
    const r = await conciliarCiclos({ provider: provedorFake({}) as never });
    expect(r.conferidos).toBe(0);
  });

  it("ciclo fora da janela NUNCA entra na varredura", async () => {
    await criarCiclo({
      status: "pago",
      valorCentavos: 10_000,
      providerChargeId: "pay-velha",
      emitidaEm: new Date("2020-01-01T00:00:00Z"),
    });
    const r = await conciliarCiclos({
      janelaDias: 60,
      provider: provedorFake({}) as never,
    });
    expect(r.conferidos).toBe(0);
  });

  it("o teto FILTRA no SQL e marca truncado", async () => {
    for (let i = 0; i < 3; i++) {
      await criarCiclo({
        status: "pago",
        valorCentavos: 10_000,
        providerChargeId: `pay-${i}`,
      });
    }
    const r = await conciliarCiclos({
      limite: 2,
      provider: provedorFake({
        "pay-0": { status: "paga", valorCentavos: 10_000 },
        "pay-1": { status: "paga", valorCentavos: 10_000 },
        "pay-2": { status: "paga", valorCentavos: 10_000 },
      }) as never,
    });
    expect(r.conferidos).toBe(2);
    expect(r.truncado).toBe(true);
  });

  it("âncora de débito agrupado não acusa valor divergente", async () => {
    const ancora = await criarCiclo({
      status: "devido",
      valorCentavos: 10_000,
      providerChargeId: "pay-debito",
    });
    const filho = await criarCiclo({
      status: "devido",
      valorCentavos: 20_000,
      providerChargeId: null,
    });
    await owner!`UPDATE billing_cycle SET debito_agrupado_em = ${ancora} WHERE id = ${filho}`;
    const r = await conciliarCiclos({
      provider: provedorFake({
        "pay-debito": { status: "pendente", valorCentavos: 30_000 },
      }) as never,
    });
    expect(r.conferidos).toBe(1);
    expect(r.divergencias).toEqual([]);
  });

  it("o teto padrão é 100", () => {
    expect(TETO_CONCILIACAO_POR_PASSADA).toBe(100);
  });
});
