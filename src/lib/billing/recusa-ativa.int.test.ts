import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

// Mesma razão dos demais .int.test.ts do repo: módulos do servidor puxam
// "server-only", que lança fora do bundle de servidor do Next.
vi.mock("server-only", () => ({}));

const { obterRecusaAtiva } = await import("./recusa-ativa");
const { withTenant } = await import("@/db/rls");

const describeSeDb = hasDb ? describe : describe.skip;

const CLINICA_A = "00000000-0000-0000-0000-000000336a01";
const CLINICA_B = "00000000-0000-0000-0000-000000336a02";
const CLINICAS = [CLINICA_A, CLINICA_B];

const SUB_A = "00000000-0000-0000-0000-000000336b01";
const SUB_B = "00000000-0000-0000-0000-000000336b02";

const VINCULO_A = "vinculo-fake-336-aaaa";
const VINCULO_B = "vinculo-fake-336-bbbb";

const PAST_DUE_DESDE = new Date("2026-08-10T12:00:00.000Z");
const CARENCIA_DIAS = 10;

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

// ── Fixtures — copiadas/adaptadas de carencia-vencida.int.test.ts ──────────

async function criarAssinatura(opcoes: {
  clinicId: string;
  subscriptionId: string;
  vinculoId: string;
  status: "past_due" | "active";
  pastDueDesde?: Date | null;
  carenciaDias?: number;
}): Promise<void> {
  await owner!`
    INSERT INTO clinic (id, nome)
    VALUES (${opcoes.clinicId}, ${`Clínica #336 ${opcoes.clinicId.slice(-4)}`})`;

  await owner!`
    INSERT INTO subscription
      (id, clinic_id, status, provider, provider_subscription_id,
       provider_customer_id, ciclo_dias, carencia_dias, past_due_desde)
    VALUES (
      ${opcoes.subscriptionId}, ${opcoes.clinicId},
      ${opcoes.status}::subscription_status,
      'asaas', ${opcoes.vinculoId}, 'cli-fake-336',
      30, ${opcoes.carenciaDias ?? 10}, ${opcoes.pastDueDesde ?? null}
    )`;
}

async function criarCiclo(opcoes: {
  clinicId: string;
  subscriptionId: string;
  inicio: Date;
  fim: Date;
  status: "aberto" | "apurado" | "falhou" | "aguardando_pagamento" | "pago";
  valorCentavos: number;
  recusaCodigo?: string | null;
}): Promise<string> {
  const linhas = (await owner!`
    INSERT INTO billing_cycle
      (clinic_id, subscription_id, inicio, fim, status, valor_centavos,
       recusa_codigo)
    VALUES (
      ${opcoes.clinicId}, ${opcoes.subscriptionId},
      ${opcoes.inicio}, ${opcoes.fim},
      ${opcoes.status}::billing_cycle_status, ${opcoes.valorCentavos},
      ${opcoes.recusaCodigo ?? null}
    )
    RETURNING id`) as unknown as { id: string }[];
  return linhas[0]!.id;
}

async function limpar(): Promise<void> {
  await owner!`DELETE FROM billing_cycle WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM subscription WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM audit_log WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM patient WHERE clinic_id = ANY(${CLINICAS}::uuid[])`;
  await owner!`DELETE FROM clinic WHERE id = ANY(${CLINICAS}::uuid[])`;
}

/**
 * A faixa do D36 é lida sob `app_role`, com RLS ligada. O que precisa ficar
 * travado aqui não é a redação (isso é `recusa-ui.test.ts`) e sim três fatos de
 * banco:
 *
 * 1. a clínica enxerga a própria recusa (grants da 0071 + coluna da 0100);
 * 2. não enxerga a de outro tenant;
 * 3. ciclo mais recente PAGO devolve `null` — a faixa some sozinha quando a
 *    cobrança é liquidada, sem ninguém apagar estado.
 */
describeSeDb("obterRecusaAtiva (RLS)", () => {
  afterAll(async () => {
    if (owner) {
      await limpar();
      await owner.end();
    }
  });

  beforeEach(async () => {
    await limpar();

    // Clínica A: assinatura past_due, ciclo mais recente falhou.
    await criarAssinatura({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      vinculoId: VINCULO_A,
      status: "past_due",
      pastDueDesde: PAST_DUE_DESDE,
      carenciaDias: CARENCIA_DIAS,
    });
    await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-07-10T12:00:00.000Z"),
      fim: new Date("2026-08-09T12:00:00.000Z"),
      status: "falhou",
      valorCentavos: 3900,
      recusaCodigo: "PAYMENT_OVERDUE",
    });

    // Clínica B: assinatura ativa, sem recusa — usada só para o caso de
    // isolamento entre tenants.
    await criarAssinatura({
      clinicId: CLINICA_B,
      subscriptionId: SUB_B,
      vinculoId: VINCULO_B,
      status: "active",
    });
  });

  it("devolve a recusa do ciclo mais recente da própria clínica", async () => {
    const recusa = await withTenant(
      { clinicId: CLINICA_A, userId: "user-336-a", role: "coordenador" },
      (tx) => obterRecusaAtiva(tx, CLINICA_A),
    );

    expect(recusa).not.toBeNull();
    expect(recusa!.recusaCodigo).toBe("PAYMENT_OVERDUE");
    expect(recusa!.statusAssinatura).toBe("past_due");
    expect(recusa!.pastDueDesde).toBeInstanceOf(Date);
    expect(recusa!.pastDueDesde!.toISOString()).toBe(
      PAST_DUE_DESDE.toISOString(),
    );
    expect(recusa!.carenciaDias).toBe(CARENCIA_DIAS);
  });

  it("não enxerga a recusa de outro tenant", async () => {
    const recusa = await withTenant(
      { clinicId: CLINICA_B, userId: "user-336-b", role: "coordenador" },
      (tx) => obterRecusaAtiva(tx, CLINICA_A),
    );

    expect(recusa).toBeNull();
  });

  it("devolve null quando o ciclo mais recente foi pago", async () => {
    // Planta um ciclo `pago` com `fim` posterior ao ciclo `falhou` do
    // beforeEach — o `ORDER BY bc.fim DESC` deve escolher este.
    await criarCiclo({
      clinicId: CLINICA_A,
      subscriptionId: SUB_A,
      inicio: new Date("2026-08-10T12:00:00.000Z"),
      fim: new Date("2026-09-09T12:00:00.000Z"),
      status: "pago",
      valorCentavos: 3900,
      recusaCodigo: null,
    });

    const recusa = await withTenant(
      { clinicId: CLINICA_A, userId: "user-336-a", role: "coordenador" },
      (tx) => obterRecusaAtiva(tx, CLINICA_A),
    );

    expect(recusa).toBeNull();
  });
});
