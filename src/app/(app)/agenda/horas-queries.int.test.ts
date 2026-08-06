import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// horas-queries.ts é ctx-accepting puro (sem "use server"), mas importa @/db
// que puxa server-only transitivamente. Neutraliza e importa dinamicamente.
vi.mock("server-only", () => ({}));
const { carregarHorasPaciente, carregarHorasTerapeuta } =
  await import("./horas-queries");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_T1 = "a0000000-0000-0000-0000-000000000002";
const PATIENT_P = "cccccccc-0000-0000-0000-000000000001";

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("horas-queries — paciente/terapeuta (RLS)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session, agendamento_recorrente, patient_alvo_disciplina, janela_trabalho, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord A', 'coord@a.test'),
      (${U_T1}, 'Terapeuta Um', 't1@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PATIENT_P}, ${CLINIC_A}, 'Paciente P')`;

    // alvo: 12h ABA vigente (vigencia_fim aberta).
    await owner`INSERT INTO patient_alvo_disciplina (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
      VALUES (${CLINIC_A}, ${PATIENT_P}, 'aba', 12, '2026-01-01')`;

    // regras ativas somando 8h ABA (2 regras de 240min) → agendado=8, abaixo de 12.
    await owner`INSERT INTO agendamento_recorrente
      (clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES
      (${CLINIC_A}, ${PATIENT_P}, ${U_T1}, 'aba', 1, '08:00', 240, '2026-01-01', 'ativo'),
      (${CLINIC_A}, ${PATIENT_P}, ${U_T1}, 'aba', 2, '08:00', 240, '2026-01-01', 'ativo')`;

    // janelas do terapeuta: seg 08-12 (4h) + ter 08-12 (4h) = capacidade 8h.
    await owner`INSERT INTO janela_trabalho (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES
      (${CLINIC_A}, ${U_T1}, 1, '08:00', '12:00'),
      (${CLINIC_A}, ${U_T1}, 2, '08:00', '12:00')`;
  });

  afterAll(async () => {
    await owner?.end();
  });

  test("carregarHorasPaciente: alvo 12 vs agendado 8 → alerta", async () => {
    const linhas = await carregarHorasPaciente(ctxCoord, PATIENT_P);
    const aba = linhas.find((l) => l.disciplina === "aba");
    expect(aba).toBeDefined();
    expect(aba!.alvo).toBe(12);
    expect(aba!.agendado).toBe(8);
    expect(aba!.alerta).toBe(true);
  });

  test("prescrição fechada HOJE não conta como alvo (represcrição, #203)", async () => {
    // Represcrever pela ficha clínica fecha a linha antiga com a data de hoje e
    // abre a nova no mesmo dia. Com o filtro anterior (`vigencia_fim >= hoje`)
    // as DUAS casavam e o alvo da disciplina virava sorteio de qual linha o
    // Postgres devolvesse por último. Vigência fechada não é vigência.
    await owner`UPDATE patient_alvo_disciplina
                   SET vigencia_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                 WHERE patient_id = ${PATIENT_P} AND disciplina = 'aba'`;
    await owner`INSERT INTO patient_alvo_disciplina
                  (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
                VALUES (${CLINIC_A}, ${PATIENT_P}, 'aba', 6,
                        (now() AT TIME ZONE 'America/Sao_Paulo')::date)`;

    const aba = (await carregarHorasPaciente(ctxCoord, PATIENT_P)).find(
      (l) => l.disciplina === "aba",
    );
    expect(aba!.alvo).toBe(6);

    // Restaura o estado do fixture para não contaminar os casos seguintes.
    await owner`DELETE FROM patient_alvo_disciplina
                 WHERE patient_id = ${PATIENT_P} AND horas_alvo_semana = 6`;
    await owner`UPDATE patient_alvo_disciplina SET vigencia_fim = NULL
                 WHERE patient_id = ${PATIENT_P} AND disciplina = 'aba'`;
  });

  test("carregarHorasTerapeuta: vago = capacidade - alocado - bloqueado", async () => {
    const r = await carregarHorasTerapeuta(ctxCoord, U_T1);
    expect(r.capacidade).toBe(8);
    expect(r.alocado).toBe(8);
    expect(r.vago).toBe(0); // 8 - 8 - 0
    expect(r.pacientes).toEqual([{ id: PATIENT_P, nome: "Paciente P" }]);
  });
});
