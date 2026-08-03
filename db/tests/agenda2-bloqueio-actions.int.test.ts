import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "bbbb0000-0000-0000-0000-0000000000a1";
const U_COORD_A = "bbbb0000-0000-0000-0000-0000000000c1";
const PAC_A1 = "bbbb0000-0000-0000-0000-0000000000e1";

describe.skipIf(!hasDb)("bloqueio actions — validação + persistência", () => {
  let owner: ReturnType<typeof postgres>;
  let actions: typeof import("@/app/(app)/agenda/bloqueio-actions");
  let queries: typeof import("@/app/(app)/agenda/bloqueio-queries");
  let appSql: typeof import("@/db/client").sql;
  const ctxCoord = {
    clinicId: CLINIC_A,
    userId: U_COORD_A,
    role: "coordenador",
  } as const;

  beforeAll(async () => {
    actions = await import("@/app/(app)/agenda/bloqueio-actions");
    queries = await import("@/app/(app)/agenda/bloqueio-queries");
    ({ sql: appSql } = await import("@/db/client"));
    // getTenantContext lê cookies; sobrescrevemos para os testes de action:
    const tenant = await import("@/auth/tenant");
    vi.spyOn(tenant, "getTenantContext").mockResolvedValue(ctxCoord);
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica A', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_A}, 'Coord A', 'coord.a@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente A1')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
    vi.restoreAllMocks();
  });

  function fd(obj: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(obj)) f.set(k, v);
    return f;
  }

  test("cria bloqueio de paciente válido", async () => {
    const r = await actions.criarBloqueioAction(
      {},
      fd({
        escopo: "paciente",
        patientId: PAC_A1,
        dataInicio: "2026-07-20",
        dataFim: "2026-08-10",
        motivo: "Viagem",
      }),
    );
    expect(r.ok).toBe(true);
    const lista = await queries.listarBloqueios(ctxCoord, {
      escopo: "paciente",
      patientId: PAC_A1,
    });
    expect(lista).toHaveLength(1);
    expect(lista[0]!.terapeutaId).toBeNull(); // I-B5: escopo=paciente zera terapeuta
  });

  test("rejeita paciente sem patientId (I-B5) sem tocar o banco", async () => {
    const r = await actions.criarBloqueioAction(
      {},
      fd({
        escopo: "paciente",
        dataInicio: "2026-07-20",
        dataFim: "2026-08-10",
        motivo: "x",
      }),
    );
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain("paciente");
  });

  test("rejeita dataFim < dataInicio", async () => {
    const r = await actions.criarBloqueioAction(
      {},
      fd({
        escopo: "clinica",
        dataInicio: "2026-08-10",
        dataFim: "2026-07-20",
        motivo: "Feriado",
      }),
    );
    expect(r.error).toBeTruthy();
  });
});
