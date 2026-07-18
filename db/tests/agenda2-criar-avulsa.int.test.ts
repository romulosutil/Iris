import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000e1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0e1";
const U_T1_A = "00000000-0000-0000-0000-0000000071e1";
const PAC_A1 = "00000000-0000-0000-0000-00000000ace1";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const base = {
  patientId: PAC_A1,
  terapeutaId: U_T1_A,
  disciplina: "aba",
  tipo: "avaliacao" as const,
  dataISO: "2026-07-13",
  horaInicio: "09:00",
  duracaoMin: 60,
  modalidade: "presencial" as const,
};

let owner: ReturnType<typeof postgres>;
let criarAvulsa: typeof import("@/app/(app)/agenda/queries").criarAvulsa;
let ConflitoError: typeof import("@/app/(app)/agenda/queries").ConflitoError;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("criarAvulsa", () => {
  beforeAll(async () => {
    ({ criarAvulsa, ConflitoError } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (criar-avulsa)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.criaravulsa@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.criaravulsa@t.com')`;
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

  test("cria session avulsa com recorrenteId null e estado agendada", async () => {
    const { id } = await criarAvulsa(ctxCoordA, base);
    const [s] = await owner`SELECT recorrente_id, estado, tipo FROM session WHERE id = ${id}`;
    expect(s?.recorrente_id).toBeNull();
    expect(s?.estado).toBe("agendada");
    expect(s?.tipo).toBe("avaliacao");
  });

  test("overbook no mesmo terapeuta é barrado pelo EXCLUDE gist → ConflitoError", async () => {
    await criarAvulsa(ctxCoordA, base);
    await expect(
      criarAvulsa(ctxCoordA, { ...base, horaInicio: "09:30" }),
    ).rejects.toBeInstanceOf(ConflitoError);
  });

  test("colisão com regra ativa (sem linha session) no mesmo terapeuta/dia é barrada pelo pré-check APP (buraco regra×avulsa) — não pelo gist, que não vê regra", async () => {
    // 2026-07-13 é segunda-feira (diaSemana=1). Regra ativa 09:00-10:00,
    // vigência já iniciada — não existe linha `session` para essa regra, então
    // o EXCLUDE gist não a enxerga; só o pré-check em app pode barrar.
    await owner`INSERT INTO agendamento_recorrente
      (clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, 'aba', 1, '09:00', 60, '2026-07-06', 'ativo')`;
    await expect(criarAvulsa(ctxCoordA, base)).rejects.toBeInstanceOf(ConflitoError);
    // confirma que nenhuma session foi criada (rejeitado antes do insert/gist).
    const sess = await owner`SELECT id FROM session`;
    expect(sess).toHaveLength(0);
  });

  test("colisão com regra ativa do mesmo paciente (terapeuta diferente) lança ConflitoError", async () => {
    const U_T2_A = "00000000-0000-0000-0000-0000000072e1";
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_T2_A}, 'T2 A', 't2.a.criaravulsa@t.com')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T2_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;
    await owner`INSERT INTO agendamento_recorrente
      (clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T2_A}, 'aba', 1, '09:00', 60, '2026-07-06', 'ativo')`;
    // base é do U_T1_A (terapeuta livre); só a dimensão paciente deve colidir.
    await expect(criarAvulsa(ctxCoordA, base)).rejects.toBeInstanceOf(ConflitoError);
  });
});
