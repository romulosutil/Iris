import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000d3";
const U_COORD = "00000000-0000-0000-0000-00000000c0d3";
const U_T1 = "00000000-0000-0000-0000-0000000071d3";
const PAC = "00000000-0000-0000-0000-00000000acd3";
const REGRA = "00000000-0000-0000-0000-000000009903";
const ctx = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let q: typeof import("@/app/(app)/agenda/queries");

describe.skipIf(!hasDb)("encerrarRegra / contarFuturas / proximaSessao", () => {
  beforeAll(async () => {
    q = await import("@/app/(app)/agenda/queries");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, agendamento_recorrente, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'A', 'America/Sao_Paulo')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'C', 'c@d3'), (${U_T1}, 'T', 't@d3')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'Ana')`;
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${REGRA}, ${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', 1, '09:00', 60, '2026-07-06', 'ativo')`;
    // passado realizada (06/07) + futura agendada (20/07, 27/07)
    await owner`INSERT INTO session (clinic_id, patient_id, terapeuta_id, recorrente_id, agendada_para, estado, duracao_min, tipo, disciplina) VALUES
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, '2026-07-06T12:00:00Z', 'realizada', 60, 'terapia', 'aba'),
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, '2026-07-20T12:00:00Z', 'agendada', 60, 'terapia', 'aba'),
      (${CLINIC_A}, ${PAC}, ${U_T1}, ${REGRA}, '2026-07-27T12:00:00Z', 'agendada', 60, 'terapia', 'aba')`;
  });

  test("contarFuturasDaRegra conta só agendadas a partir de amanhã", async () => {
    // encerrar em 2026-07-13 → futuras = 20 e 27 (2)
    expect(await q.contarFuturasDaRegra(ctx, REGRA, "2026-07-13")).toBe(2);
  });

  test("encerrarRegra remove futuras agendadas e preserva passado (D-5)", async () => {
    const { removidas } = await q.encerrarRegra(ctx, REGRA, "2026-07-13");
    expect(removidas).toBe(2);
    const rest = await owner`SELECT estado FROM session WHERE recorrente_id = ${REGRA} ORDER BY agendada_para`;
    expect(rest.map((r) => r.estado)).toEqual(["realizada"]); // só o passado sobra
    const [regra] = await owner`SELECT status, vigencia_fim::text AS vigencia_fim FROM agendamento_recorrente WHERE id = ${REGRA}`;
    expect(regra!.status).toBe("encerrado");
    expect(regra!.vigencia_fim).toBe("2026-07-13");
  });

  test("proximaSessaoDaRegra devolve a menor futura", async () => {
    const prox = await q.proximaSessaoDaRegra(ctx, REGRA);
    expect(prox).toBe("2026-07-20"); // 06/07 já passou
  });
});
