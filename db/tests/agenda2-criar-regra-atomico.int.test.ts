import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000d2";
const U_COORD = "00000000-0000-0000-0000-00000000c0d2";
const U_T1 = "00000000-0000-0000-0000-0000000071d2";
const PAC = "00000000-0000-0000-0000-00000000acd2";
const ctx = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;
const base = {
  patientId: PAC, terapeutaId: U_T1, disciplina: "aba", diaSemana: 1,
  horaInicio: "09:00", duracaoMin: 60, semanaVisivelISO: "2026-07-13", hojeISO: "2026-07-13",
};

let owner: ReturnType<typeof postgres>;
let criarRegra: typeof import("@/app/(app)/agenda/queries").criarRegra;

describe.skipIf(!hasDb)("criarRegra — atomicidade (F5b)", () => {
  beforeAll(async () => {
    ({ criarRegra } = await import("@/app/(app)/agenda/queries"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  beforeEach(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, agendamento_recorrente, session, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'A', 'America/Sao_Paulo')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'C', 'c@d2'), (${U_T1}, 'T', 't@d2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'Ana')`;
  });

  test("23P01 numa ocorrência NÃO aborta a criação da regra (regra criada, data pulada)", async () => {
    // Sessão-fantasma: presa a OUTRA regra (dia_semana=2, terça), fora do
    // alcance dos 2 pré-checks app-level (pattern-check só olha regras ATIVAS
    // com o MESMO dia_semana da nova regra; avulsa-check só olha
    // recorrente_id IS NULL) — mas ocupa fisicamente o terapeuta na
    // 2026-07-20 09:00 SP (segunda), o mesmo slot da nova regra. O EXCLUDE
    // gist não sabe de "pré-check", só vê a linha física → 23P01 no insert
    // dessa data específica dentro de materializarNaTx, que deve ser
    // reportado como pulada sem abortar a tx inteira (D-7/F5b).
    const OUTRA_REGRA = "00000000-0000-0000-0000-0000000099d2";
    await owner`INSERT INTO agendamento_recorrente
      (id, clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${OUTRA_REGRA}, ${CLINIC_A}, ${PAC}, ${U_T1}, 'aba', 2, '09:00', 60, '2026-07-13', 'ativo')`;
    await owner`INSERT INTO session (clinic_id, patient_id, terapeuta_id, recorrente_id, agendada_para, estado, duracao_min, tipo, disciplina)
      VALUES (${CLINIC_A}, ${PAC}, ${U_T1}, ${OUTRA_REGRA}, '2026-07-20T12:00:00Z', 'agendada', 60, 'terapia', 'aba')`;
    const { id } = await criarRegra(ctx, base);
    const [regraRow] = (await owner`SELECT count(*)::int AS n FROM agendamento_recorrente WHERE id = ${id}`) as { n: number }[];
    expect(regraRow!.n).toBe(1); // regra existe
    const mat = await owner`SELECT count(*)::int AS n FROM session WHERE recorrente_id = ${id}`;
    expect(mat[0]!.n).toBeGreaterThanOrEqual(11); // 20/07 pulada, resto materializado
  });
});
