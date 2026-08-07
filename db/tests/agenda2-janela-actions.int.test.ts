// db/tests/agenda2-janela-actions.int.test.ts
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";
vi.mock("server-only", () => ({}));

const CLINIC_A = "aaaa0000-0000-0000-0000-0000000000a1";
const U_COORD_A = "aaaa0000-0000-0000-0000-0000000000c1";
const U_T1_A = "aaaa0000-0000-0000-0000-0000000000f1";
// Papel duplo na MESMA clínica: a PK de `user_role` é (user_id, clinic_id,
// papel), então coordenador que também atende tem 2 linhas — o `selectDistinct`
// de `listarTerapeutas` existe por causa disso.
const U_DUAL_A = "aaaa0000-0000-0000-0000-0000000000d1";

describe.skipIf(!hasDb)("janela actions — salvar/carregar/RLS", () => {
  let owner: ReturnType<typeof postgres>;
  let actions: typeof import("@/app/(app)/equipe/[id]/queries");
  let appSql: typeof import("@/db/client").sql;
  const ctxCoord = {
    clinicId: CLINIC_A,
    userId: U_COORD_A,
    role: "coordenador",
  } as const;
  const ctxT1 = {
    clinicId: CLINIC_A,
    userId: U_T1_A,
    role: "terapeuta",
  } as const;

  beforeAll(async () => {
    actions = await import("@/app/(app)/equipe/[id]/queries");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, janela_trabalho RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica A', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a@t.com'), (${U_T1_A}, 'T1 A', 't1.a@t.com'),
      (${U_DUAL_A}, 'Dual A', 'dual.a@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'), (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_DUAL_A}, ${CLINIC_A}, 'coordenador'), (${U_DUAL_A}, ${CLINIC_A}, 'terapeuta')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  // O coordenador ENTRA na lista desde `eddbf5d` ("coordenador em
  // agendamentos"): em clínica pequena quem coordena também atende, e ficar de
  // fora daqui significava não ter janela de trabalho nem receber alocação na
  // agenda. A asserção antiga (`not.toContain(U_COORD_A)`) ficou para trás e
  // deixou a suíte vermelha em crônico, que é como vermelho novo passa batido.
  test("listarTerapeutas retorna terapeutas e coordenadores da clínica", async () => {
    const ids = (await actions.listarTerapeutas(ctxCoord)).map((t) => t.id);
    expect(ids).toContain(U_T1_A);
    expect(ids).toContain(U_COORD_A);
  });

  test("listarTerapeutas não duplica quem acumula os dois papéis", async () => {
    const ids = (await actions.listarTerapeutas(ctxCoord)).map((t) => t.id);
    expect(ids.filter((id) => id === U_DUAL_A)).toEqual([U_DUAL_A]);
  });

  test("coordenador salva janelas fundidas e recarrega", async () => {
    await actions.salvarJanelas(ctxCoord, U_T1_A, [
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "10:00", horaFim: "14:00" }, // sobrepõe -> funde 08-14
    ]);
    const carregado = await actions.carregarDisponibilidade(ctxCoord, U_T1_A);
    expect(carregado).toEqual([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "14:00" },
    ]);
  });

  test("salvar de novo substitui (não acumula)", async () => {
    await actions.salvarJanelas(ctxCoord, U_T1_A, [
      { diaSemana: 2, horaInicio: "09:00", horaFim: "11:00" },
    ]);
    const carregado = await actions.carregarDisponibilidade(ctxCoord, U_T1_A);
    expect(carregado).toEqual([
      { diaSemana: 2, horaInicio: "09:00", horaFim: "11:00" },
    ]);
  });

  test("terapeuta é barrado por requireRole", async () => {
    await expect(
      actions.salvarJanelas(ctxT1, U_T1_A, [
        { diaSemana: 3, horaInicio: "08:00", horaFim: "09:00" },
      ]),
    ).rejects.toThrow();
  });
});
