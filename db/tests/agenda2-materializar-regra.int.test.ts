import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000d1";
const U_COORD = "00000000-0000-0000-0000-00000000c0d1";
const U_T1 = "00000000-0000-0000-0000-0000000071d1";
const PAC = "00000000-0000-0000-0000-00000000acd1";
const REGRA = "00000000-0000-0000-0000-000000009901";
const ctx = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let materializarRegra: typeof import("@/app/(app)/agenda/queries").materializarRegra;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("materializarRegra", () => {
  beforeAll(async () => {
    ({ materializarRegra } = await import("@/app/(app)/agenda/queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });

  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'A', 'America/Sao_Paulo')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'c@d1'), (${U_T1}, 'Tera', 't@d1')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'Ana')`;
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${REGRA}, ${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', 1, '09:00', 60, '2026-07-13', 'ativo')`;
  });

  test("gera ocorrências nas segundas do horizonte (D-1)", async () => {
    const r = await materializarRegra(ctx, REGRA, "2026-08-03"); // 4 segundas: 13,20,27/07 + 03/08
    expect(r.geradas).toBe(4);
    expect(r.puladas).toEqual([]);
    const { n } = (
      await owner`SELECT count(*)::int AS n FROM session WHERE recorrente_id = ${REGRA}`
    )[0]! as { n: number };
    expect(n).toBe(4);
    // instante IANA correto: 09:00 SP = 12:00Z na 1ª segunda
    const { agendada_para } = (
      await owner`
      SELECT agendada_para FROM session WHERE recorrente_id = ${REGRA} ORDER BY agendada_para LIMIT 1`
    )[0]! as { agendada_para: Date };
    expect(new Date(agendada_para).toISOString()).toBe(
      "2026-07-13T12:00:00.000Z",
    );
  });

  test("idempotente: rodar 2× não duplica (D-2, 23505 silencioso)", async () => {
    await materializarRegra(ctx, REGRA, "2026-08-03");
    const r2 = await materializarRegra(ctx, REGRA, "2026-08-03");
    expect(r2.geradas).toBe(0); // nada novo
    const { n } = (
      await owner`SELECT count(*)::int AS n FROM session WHERE recorrente_id = ${REGRA}`
    )[0]! as { n: number };
    expect(n).toBe(4); // estável
  });

  test("overbook: avulsa no slot vira pulada, resto materializa (D-3 / F1)", async () => {
    // avulsa ocupando o terapeuta na 2ª segunda (20/07 09:00 SP = 12:00Z)
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, agendada_para, estado, duracao_min, tipo, disciplina)
      VALUES (${CLINIC_A}, ${PAC}, ${U_T1}, '2026-07-20T12:00:00Z', 'agendada', 60, 'avaliacao', 'aba')`;
    const r = await materializarRegra(ctx, REGRA, "2026-08-03");
    expect(r.puladas).toEqual(["2026-07-20"]); // buraco reportado, não engolido
    expect(r.geradas).toBe(3);
  });

  test("pula datas de bloqueio do paciente (D-4)", async () => {
    await owner`INSERT INTO bloqueio (clinic_id, escopo, patient_id, data_inicio, data_fim, motivo)
      VALUES (${CLINIC_A}, 'paciente', ${PAC}, '2026-07-20', '2026-07-20', 'viagem')`;
    const r = await materializarRegra(ctx, REGRA, "2026-08-03");
    expect(r.geradas).toBe(3);
    const datas =
      await owner`SELECT agendada_para FROM session WHERE recorrente_id = ${REGRA} ORDER BY 1`;
    expect(
      datas.map((d) => new Date(d.agendada_para).toISOString().slice(0, 10)),
    ).not.toContain("2026-07-20");
  });
});
