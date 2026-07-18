import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000f1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000f2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0f1";
const U_T1_A = "00000000-0000-0000-0000-0000000071f1"; // terapeuta na equipe de PAC_A1
const U_COORD_B = "00000000-0000-0000-0000-00000000c0f2";
const PAC_A1 = "00000000-0000-0000-0000-00000000acf1";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const ctxCoordB = { clinicId: CLINIC_B, userId: U_COORD_B, role: "coordenador" } as const;

let owner: ReturnType<typeof postgres>;
let carregarSemana: typeof import("@/app/(app)/agenda/queries").carregarSemana;
let disponibilidadeTerapeutaNoDia: typeof import("@/app/(app)/agenda/queries").disponibilidadeTerapeutaNoDia;
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("carregarSemana / disponibilidadeTerapeutaNoDia", () => {
  beforeAll(async () => {
    ({ carregarSemana, disponibilidadeTerapeutaNoDia } = await import(
      "@/app/(app)/agenda/queries"
    ));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      agendamento_recorrente, session, janela_trabalho, bloqueio RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (carregar-semana)', false),
      (${CLINIC_B}, 'Clínica B (carregar-semana)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.carregarsemana@t.com'),
      (${U_T1_A}, 'T1 A', 't1.a.carregarsemana@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.carregarsemana@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Ana Alfa')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'aba', 'terapeuta_referencia')`;
    await owner`INSERT INTO agendamento_recorrente
      (clinic_id, patient_id, terapeuta_id, disciplina, dia_semana, hora_inicio, duracao_min, vigencia_inicio, status)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, 'aba', 1, '09:00', 60, '2026-07-13', 'ativo')`;
    await owner`INSERT INTO janela_trabalho (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES (${CLINIC_A}, ${U_T1_A}, 1, '08:00', '12:00')`;
    // Avulsa (recorrente_id null) — 2026-07-13 (segunda) 23:30 em São Paulo
    // (UTC-3) = 2026-07-14T02:30:00Z. O dia UTC (terça) difere do dia local
    // (segunda) — cobre o round-trip driver timestamptz → minutos-locais SP
    // (C10), que o unit test puro de fuso-min.ts não exercita.
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, duracao_min, estado, recorrente_id)
      VALUES (${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, 'aba', '2026-07-14T02:30:00Z', 30, 'agendada', NULL)`;
  });
  afterAll(async () => { await owner?.end(); await appSql?.end(); });

  test("eixo terapeuta traz regra ativa como bloco previsto", async () => {
    const r = await carregarSemana(ctxCoordA, {
      eixo: "terapeuta", entidadeId: U_T1_A, semanaInicioISO: "2026-07-13",
    });
    expect(r.blocos).toHaveLength(2);
    const previsto = r.blocos.find((b) => b.origem === "previsto");
    expect(previsto).toMatchObject({ origem: "previsto", diaSemana: 1, inicioMin: 540, rotulo: "Ana Alfa" });
    expect(r.janelas).toHaveLength(1);
    expect(r.janelas[0]).toMatchObject({ diaSemana: 1, horaInicio: "08:00:00", horaFim: "12:00:00" });
  });

  test("eixo paciente traz a mesma regra sem janelas (só eixo terapeuta preenche)", async () => {
    const r = await carregarSemana(ctxCoordA, {
      eixo: "paciente", entidadeId: PAC_A1, semanaInicioISO: "2026-07-13",
    });
    expect(r.blocos).toHaveLength(2);
    expect(r.janelas).toHaveLength(0);
  });

  test("cross-tenant: coordenador B não vê regra da clínica A (RLS filtra, não lança)", async () => {
    const r = await carregarSemana(ctxCoordB, {
      eixo: "terapeuta", entidadeId: U_T1_A, semanaInicioISO: "2026-07-13",
    });
    expect(r.blocos).toHaveLength(0);
    expect(r.janelas).toHaveLength(0);
  });

  test("avulsa (C10): timestamptz do driver vira dia/minuto locais SP corretos", async () => {
    const r = await carregarSemana(ctxCoordA, {
      eixo: "terapeuta", entidadeId: U_T1_A, semanaInicioISO: "2026-07-13",
    });
    const avulsa = r.blocos.find((b) => b.origem === "concreto");
    expect(avulsa).toMatchObject({ origem: "concreto", diaSemana: 1, inicioMin: 1410 });
  });

  test("disponibilidadeTerapeutaNoDia retorna a janela do dia certo", async () => {
    const faixas = await disponibilidadeTerapeutaNoDia(ctxCoordA, U_T1_A, "2026-07-13");
    expect(faixas).toHaveLength(1);
    expect(faixas[0]).toMatchObject({ diaSemana: 1, horaInicio: "08:00:00", horaFim: "12:00:00" });
  });
});
