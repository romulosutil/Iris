import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant, type TenantContext } from "@/db/rls";
import { previewConvenioBruto } from "./queries";
import { hasDb } from "@tests/integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!)
  : (null as never);
const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({
  role,
  userId,
  clinicId: CLINIC,
});

describe.skipIf(!hasDb)("previewConvenioBruto", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD}, 'Coord', 'c@a.test'), (${TERA}, 'Ana', 't@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD}, ${CLINIC}, 'coordenador'), (${TERA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado)
      VALUES (gen_random_uuid(), ${CLINIC}, ${PAC}, ${TERA}, 'ABA', '2026-06-10T09:00:00Z', 'realizada')`;
  });
  afterAll(async () => {
    if (hasDb) await owner.end();
  });

  test("retorna contagens do período", async () => {
    const r = await withTenant(ctx("coordenador", COORD), () =>
      previewConvenioBruto(ctx("coordenador", COORD), {
        patientId: PAC,
        nomePaciente: "Miguel",
        periodoInicio: "2026-06-01",
        periodoFim: "2026-06-30",
      }),
    );
    expect(r.sessoesRealizadas).toBe(1);
    expect(r.evidenciasAprovadas).toBe(0);
  });
});
