import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000003b6a01";
const CLINIC_B = "00000000-0000-0000-0000-0000003b6b01";
const CLINIC_C = "00000000-0000-0000-0000-0000003b6c01";
const U_COORD_A = "00000000-0000-0000-0000-0000003b6a02";
const U_COORD_C = "00000000-0000-0000-0000-0000003b6c02";
const SUB_A = "00000000-0000-0000-0000-0000003b65a1";
const SUB_B = "00000000-0000-0000-0000-0000003b65b1";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxB = {
  clinicId: CLINIC_B,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxC = {
  clinicId: CLINIC_C,
  userId: U_COORD_C,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let obterCicloCorrente: typeof import("@/app/(app)/assinatura/queries").obterCicloCorrente;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("obterCicloCorrente (RLS/ciclo corrente)", () => {
  beforeAll(async () => {
    ({ obterCicloCorrente } = await import("@/app/(app)/assinatura/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // DELETE escopado, na ordem das FKs. TRUNCATE aqui derrubaria os outros
    // int-tests de billing que rodam em paralelo.
    await owner`DELETE FROM billing_cycle WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM subscription WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_C})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B}, ${CLINIC_C})`;

    await owner`INSERT INTO clinic (id, nome, is_demo, timezone) VALUES
      (${CLINIC_A}, 'Clinica A (ciclo corrente)', false, 'America/Sao_Paulo'),
      (${CLINIC_B}, 'Clinica B (ciclo corrente)', false, 'America/Manaus'),
      (${CLINIC_C}, 'Clinica C (sem assinatura)', false, 'America/Sao_Paulo')`;
    // Sufixo do arquivo no e-mail: `app_user.email` e UNIQUE no repo inteiro, e
    // um endereco repetido derruba o setup de outro int-test.
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.ciclocorrente@t.com'),
      (${U_COORD_C}, 'Coord C', 'coord.c.ciclocorrente@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_C}, ${CLINIC_C}, 'coordenador')`;
    await owner`INSERT INTO subscription
      (id, clinic_id, status, provider, ciclo_atual_inicio, ciclo_atual_fim,
       ativada_em, past_due_desde, carencia_dias) VALUES
      (${SUB_A}, ${CLINIC_A}, 'active', 'asaas',
       '2026-08-13T00:00:00Z', '2026-09-12T00:00:00Z',
       '2026-08-13T14:00:00Z', NULL, 10),
      (${SUB_B}, ${CLINIC_B}, 'past_due', 'asaas',
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z',
       '2026-06-01T09:00:00Z', '2026-08-02T12:00:00Z', 7)`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("devolve o vinculo da propria clinica", async () => {
    const r = await obterCicloCorrente(ctxA);
    expect(r?.statusAssinatura).toBe("active");
    expect(r?.carenciaDias).toBe(10);
    expect(r?.timezone).toBe("America/Sao_Paulo");
  });

  test("nao vaza o vinculo de outra clinica", async () => {
    // A clinica B tem carencia 7 e fuso de Manaus — inconfundiveis se vazarem.
    const r = await obterCicloCorrente(ctxA);
    expect(r?.carenciaDias).not.toBe(7);
    expect(r?.timezone).not.toBe("America/Manaus");
    // E o contrario tambem: lida como B, sai B.
    const rb = await obterCicloCorrente(ctxB);
    expect(rb?.statusAssinatura).toBe("past_due");
    expect(rb?.timezone).toBe("America/Manaus");
  });

  test("devolve null quando a clinica nunca ativou", async () => {
    expect(await obterCicloCorrente(ctxC)).toBeNull();
  });

  test("devolve Date de verdade, nao string do driver", async () => {
    const r = await obterCicloCorrente(ctxA);
    expect(r?.cicloAtualFim).toBeInstanceOf(Date);
    expect(r?.ativadaEm).toBeInstanceOf(Date);
    expect(r?.pastDueDesde).toBeNull();
  });

  test("traz past_due_desde quando ele existe", async () => {
    const r = await obterCicloCorrente(ctxB);
    expect(r?.pastDueDesde).toBeInstanceOf(Date);
    expect(r?.pastDueDesde?.toISOString()).toBe("2026-08-02T12:00:00.000Z");
  });
});
