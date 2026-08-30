import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-00000036d101";
const CLINIC_B = "00000000-0000-0000-0000-00000036d102";
const U_COORD_A = "00000000-0000-0000-0000-00000036d103";
const U_TERA_A = "00000000-0000-0000-0000-00000036d104";
const U_COORD_B = "00000000-0000-0000-0000-00000036d105";
const PAC_B = "00000000-0000-0000-0000-00000036d106";

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let obterProgressoOnboarding: typeof import("@/app/(app)/onboarding-queries").obterProgressoOnboarding;
let appSql: typeof import("@/db/client").sql;

async function limpar() {
  await owner`DELETE FROM janela_trabalho WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TERA_A}, ${U_COORD_B})`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
}

describe.skipIf(!hasDb)("obterProgressoOnboarding", () => {
  beforeEach(async () => {
    owner ??= postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    ({ obterProgressoOnboarding } =
      await import("@/app/(app)/onboarding-queries"));
    ({ sql: appSql } = await import("@/db/client"));
    await limpar();
    // Estado zero: clínica recém-criada, só o coordenador.
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clinica A (onboarding)', false),
      (${CLINIC_B}, 'Clinica B (onboarding)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.onboarding36@t.com'),
      (${U_TERA_A}, 'Tera A', 'tera.a.onboarding36@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.onboarding36@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });

  afterAll(async () => {
    await limpar();
    await owner?.end();
    await appSql?.end();
  });

  test("clínica recém-criada tem os quatro passos pendentes", async () => {
    expect(await obterProgressoOnboarding(ctxA)).toEqual({
      clinica: false,
      equipe: false,
      agenda: false,
      paciente: false,
    });
  });

  test("dados da clínica só contam com razão social E cep", async () => {
    await owner`UPDATE clinic SET razao_social = 'Clinica A LTDA'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(false);
    await owner`UPDATE clinic SET endereco_cep = '01310100'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(true);
  });

  test("equipe conta um SEGUNDO usuário, não o próprio coordenador", async () => {
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(false);
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(true);
  });

  test("agenda conta janela de trabalho da clínica", async () => {
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO janela_trabalho
      (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES (${CLINIC_A}, ${U_TERA_A}, 1, '09:00', '17:00')`;
    expect((await obterProgressoOnboarding(ctxA)).agenda).toBe(true);
  });

  test("não enxerga o progresso da outra clínica", async () => {
    // B tem paciente; A não. Se o isolamento vazar, A marcaria concluído.
    await owner`INSERT INTO patient (id, clinic_id, nome)
      VALUES (${PAC_B}, ${CLINIC_B}, 'Paciente da B')`;
    expect((await obterProgressoOnboarding(ctxA)).paciente).toBe(false);
  });
});
