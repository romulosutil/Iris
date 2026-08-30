import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-00000036a101";
const CLINIC_B = "00000000-0000-0000-0000-00000036b101";
const U_COORD_A = "00000000-0000-0000-0000-00000036c101";
const SUB_A = "00000000-0000-0000-0000-00000036501a";
const SUB_B = "00000000-0000-0000-0000-00000036501b";
// Ciclos de A: um pago (mais antigo), um recusado, um aberto (não deve aparecer).
const CICLO_A_PAGO = "00000000-0000-0000-0000-0000003600a1";
const CICLO_A_FALHOU = "00000000-0000-0000-0000-0000003600a2";
const CICLO_A_ABERTO = "00000000-0000-0000-0000-0000003600a3";
const CICLO_B_PAGO = "00000000-0000-0000-0000-0000003600b1";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let listarCiclosDaClinica: typeof import("@/app/(app)/assinatura/queries").listarCiclosDaClinica;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("listarCiclosDaClinica (RLS/histórico)", () => {
  beforeAll(async () => {
    ({ listarCiclosDaClinica } =
      await import("@/app/(app)/assinatura/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // DELETE escopado, na ordem das FKs. TRUNCATE aqui derrubaria os outros
    // int-tests de billing que rodam em paralelo.
    await owner`DELETE FROM billing_cycle WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM subscription WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id = ${U_COORD_A}`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (histórico ciclos)', false),
      (${CLINIC_B}, 'Clínica B (histórico ciclos)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.histciclos@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner`INSERT INTO subscription (id, clinic_id, status, provider) VALUES
      (${SUB_A}, ${CLINIC_A}, 'active', 'asaas'),
      (${SUB_B}, ${CLINIC_B}, 'active', 'asaas')`;
    await owner`INSERT INTO billing_cycle
      (id, clinic_id, subscription_id, inicio, fim, status,
       pacientes_contados, valor_centavos, vencimento_cobranca, cobrado_em,
       invoice_url) VALUES
      (${CICLO_A_PAGO}, ${CLINIC_A}, ${SUB_A},
       '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 'pago',
       4, 15600, '2026-07-08T00:00:00Z', '2026-07-05T00:00:00Z', NULL),
      (${CICLO_A_FALHOU}, ${CLINIC_A}, ${SUB_A},
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 'falhou',
       6, 23400, '2026-08-08T00:00:00Z', NULL,
       'https://sandbox.asaas.com/i/36a2'),
      (${CICLO_A_ABERTO}, ${CLINIC_A}, ${SUB_A},
       '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 'aberto',
       0, 0, NULL, NULL, NULL),
      (${CICLO_B_PAGO}, ${CLINIC_B}, ${SUB_B},
       '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 'pago',
       99, 999900, '2026-08-08T00:00:00Z', '2026-08-02T00:00:00Z', NULL)`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("não vaza ciclo de outra clínica", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    // O ciclo da B tem valor 999900 — inconfundível se vazar.
    expect(r.map((c) => c.id)).not.toContain(CICLO_B_PAGO);
    expect(r.map((c) => c.valorCentavos)).not.toContain(999900);
  });

  test("exclui o ciclo aberto (é assunto do cartão do ciclo corrente)", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    expect(r.map((c) => c.id)).not.toContain(CICLO_A_ABERTO);
  });

  test("ordena por fim DESC — o mais recente primeiro", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    expect(r.map((c) => c.id)).toEqual([CICLO_A_FALHOU, CICLO_A_PAGO]);
  });

  test("devolve Date de verdade, não string do driver", async () => {
    const [primeiro] = await listarCiclosDaClinica(ctxA);
    expect(primeiro?.fim).toBeInstanceOf(Date);
    expect(primeiro?.cobradoEm).toBeNull();
  });

  test("traz a URL da fatura, e null quando não há", async () => {
    const r = await listarCiclosDaClinica(ctxA);
    const porId = new Map(r.map((c) => [c.id, c.invoiceUrl]));
    expect(porId.get(CICLO_A_FALHOU)).toBe("https://sandbox.asaas.com/i/36a2");
    expect(porId.get(CICLO_A_PAGO)).toBeNull();
  });

  test("pagina sem repetir nem pular linha", async () => {
    const pagina1 = await listarCiclosDaClinica(ctxA, { limite: 1 });
    const pagina2 = await listarCiclosDaClinica(ctxA, { limite: 1, offset: 1 });
    expect(pagina1.map((c) => c.id)).toEqual([CICLO_A_FALHOU]);
    expect(pagina2.map((c) => c.id)).toEqual([CICLO_A_PAGO]);
  });
});
