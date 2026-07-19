import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000e1";
const U_COORD = "00000000-0000-0000-0000-00000000c0e1";
const U_T1 = "00000000-0000-0000-0000-0000000071e1";
const PAC = "00000000-0000-0000-0000-00000000ace1";
const REGRA = "00000000-0000-0000-0000-000000009a01";
const ctx = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let conflitosDaRegra: typeof import("@/app/(app)/agenda/queries").conflitosDaRegra;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("conflitosDaRegra (F2)", () => {
  beforeAll(async () => {
    ({ conflitosDaRegra } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });

  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'A', 'America/Sao_Paulo')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'c@e1'), (${U_T1}, 'Tera', 't@e1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'Ana')`;
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${REGRA}, ${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', 1, '09:00', 60, '2026-07-06', 'ativo')`;
    // Seed manual das sessões da regra (09:00 SP = 12:00Z): 06/07, 13/07,
    // PULA 20/07 (overbook), 27/07, 03/08. max(agendada_para)=03/08 →
    // 20/07 está dentro do horizonte, não bloqueada, sem sessão → conflito.
    for (const data of ["2026-07-06", "2026-07-13", "2026-07-27", "2026-08-03"]) {
      await owner`INSERT INTO session
        (clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, duracao_min, estado, recorrente_id, tipo)
        VALUES (${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', ${data + "T12:00:00Z"}, 60, 'agendada', ${REGRA}, 'terapia')`;
    }
  });

  test("conflitosDaRegra retorna a data pulada dentro do horizonte", async () => {
    const r = await conflitosDaRegra(ctx, REGRA);
    expect(r).toEqual(["2026-07-20"]);
  });

  test("data além do max(agendada_para) NÃO é conflito", async () => {
    const r = await conflitosDaRegra(ctx, REGRA);
    expect(r).not.toContain("2026-08-10");
  });

  test("sessão cancelada no slot ainda conta como materializada (não é conflito)", async () => {
    await owner`UPDATE agendamento_recorrente SET vigencia_inicio = '2026-07-06' WHERE id = ${REGRA}`;
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, duracao_min, estado, recorrente_id, tipo)
      VALUES (${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', '2026-07-20T12:00:00Z', 60, 'cancelada', ${REGRA}, 'terapia')`;
    const r = await conflitosDaRegra(ctx, REGRA);
    expect(r).not.toContain("2026-07-20");
  });

  test("data bloqueada não conta como conflito mesmo sem sessão", async () => {
    await owner`DELETE FROM session WHERE recorrente_id = ${REGRA} AND agendada_para = '2026-07-27T12:00:00Z'`;
    await owner`INSERT INTO bloqueio (clinic_id, escopo, patient_id, data_inicio, data_fim, motivo)
      VALUES (${CLINIC_A}, 'paciente', ${PAC}, '2026-07-27', '2026-07-27', 'viagem')`;
    const r = await conflitosDaRegra(ctx, REGRA);
    expect(r).toEqual(["2026-07-20"]);
    expect(r).not.toContain("2026-07-27");
  });

  test("regra sem nenhuma sessão materializada não tem conflito", async () => {
    await owner`DELETE FROM session WHERE recorrente_id = ${REGRA}`;
    const r = await conflitosDaRegra(ctx, REGRA);
    expect(r).toEqual([]);
  });

  test("regra inexistente retorna vazio", async () => {
    const r = await conflitosDaRegra(ctx, "00000000-0000-0000-0000-000000000000");
    expect(r).toEqual([]);
  });
});
