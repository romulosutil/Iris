import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000d1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0d1";
const U_T1_A = "00000000-0000-0000-0000-0000000071d1";
const PAC_A1 = "00000000-0000-0000-0000-00000000acd1";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const base = {
  patientId: PAC_A1,
  terapeutaId: U_T1_A,
  disciplina: "aba",
  diaSemana: 1,
  horaInicio: "09:00",
  duracaoMin: 60,
  semanaVisivelISO: "2026-07-13",
  hojeISO: "2026-07-13",
};

let owner: ReturnType<typeof postgres>;
let criarRegra: typeof import("@/app/(app)/agenda/queries").criarRegra;
let ConflitoError: typeof import("@/app/(app)/agenda/queries").ConflitoError;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("criarRegra", () => {
  beforeAll(async () => {
    ({ criarRegra, ConflitoError } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo, duracao_disciplina) VALUES
      (${CLINIC_A}, 'Clínica A (criar-regra)', false, ${owner.json({ aba: 60 })})`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.criarregra@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.criarregra@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  beforeEach(async () => {
    await owner`TRUNCATE agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE patient CASCADE`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Ana')`;
  });

  test("cria regra E materializa o horizonte na mesma tx (D-7, ex-C1)", async () => {
    const { id } = await criarRegra(ctxCoordA, base);
    const [regra] = await owner`SELECT vigencia_inicio::text AS vigencia_inicio FROM agendamento_recorrente WHERE id = ${id}`;
    expect(regra?.vigencia_inicio).toBe("2026-07-13");
    const sess = await owner`SELECT count(*)::int AS n FROM session WHERE recorrente_id = ${id}`;
    expect(sess[0]?.n).toBeGreaterThanOrEqual(12); // ~12-13 segundas em 84 dias
  });

  test("colisão de horário no mesmo terapeuta lança ConflitoError (C2/C5)", async () => {
    await criarRegra(ctxCoordA, base);
    await expect(criarRegra(ctxCoordA, { ...base, horaInicio: "09:30" })).rejects.toBeInstanceOf(
      ConflitoError,
    );
  });

  test("colisão com avulsa (session recorrenteId null) do mesmo terapeuta/dia lança ConflitoError", async () => {
    // 2026-07-13 é segunda-feira (diaSemana=1), 09:00-09:30 local (UTC-03:00).
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, recorrente_id, disciplina, tipo, agendada_para, duracao_min, estado, modalidade)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, NULL, 'aba', 'avaliacao', '2026-07-13T09:00:00-03:00', 60, 'agendada', 'presencial')`;
    await expect(criarRegra(ctxCoordA, base)).rejects.toBeInstanceOf(ConflitoError);
  });

  test("colisão com avulsa do mesmo paciente (terapeuta diferente) lança ConflitoError", async () => {
    const U_T2_A = "00000000-0000-0000-0000-0000000072d1";
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_T2_A}, 'T2 A', 't2.a.criarregra@t.com')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T2_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;
    // Avulsa é de OUTRO terapeuta (U_T2_A), mesmo paciente (PAC_A1) — só a
    // dimensão paciente deve colidir; base usa U_T1_A (dimensão terapeuta livre).
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, recorrente_id, disciplina, tipo, agendada_para, duracao_min, estado, modalidade)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T2_A}, NULL, 'aba', 'avaliacao', '2026-07-13T09:00:00-03:00', 60, 'agendada', 'presencial')`;
    await expect(criarRegra(ctxCoordA, base)).rejects.toBeInstanceOf(ConflitoError);
  });
});
