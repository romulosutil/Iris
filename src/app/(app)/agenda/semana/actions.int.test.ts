import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// queries.ts é puro (sem next/headers), mas seguimos o mesmo padrão do resto
// da suíte de integração: mock de server-only + import dinâmico após mocks.
vi.mock("server-only", () => ({}));
const { listarPacientes, criarRegra, criarAvulsa } = await import("../queries");
const { RoleError } = await import("@/auth/require-role");
const { sql: appSql } = await import("@/db/client");
const { withTenant } = await import("@/db/rls");
const { session } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_T1 = "a0000000-0000-0000-0000-000000000002";
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
const PATIENT_P = "cccccccc-0000-0000-0000-000000000001";
const FALTA_ID = "dddddddd-0000-0000-0000-000000000001";

let owner: ReturnType<typeof postgres>;

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxAdmin = {
  clinicId: CLINIC_A,
  userId: U_ADMIN,
  role: "admin_recepcao",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;

describe.skipIf(!hasDb)("agenda/semana — gate requireAgendar (RLS)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome, duracao_disciplina) VALUES (${CLINIC_A}, 'Clínica A', ${owner.json({ aba: 60 })})`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord A', 'coord@a.test'),
      (${U_T1}, 'Terapeuta Um', 't1@a.test'),
      (${U_ADMIN}, 'Recepção A', 'adm@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PATIENT_P}, ${CLINIC_A}, 'Paciente P')`;
    // Sessão falta_paciente (via conexão owner) — a original que a reposição
    // vai apontar via repostaDe.
    await owner`INSERT INTO session
      (id, clinic_id, patient_id, terapeuta_id, disciplina, tipo, agendada_para, duracao_min, estado)
      VALUES
      (${FALTA_ID}, ${CLINIC_A}, ${PATIENT_P}, ${U_T1}, 'aba', 'terapia', '2026-07-13T13:00:00Z', 60, 'falta_paciente')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("recepção lista pacientes (gate agendar)", async () => {
    const r = await listarPacientes(ctxAdmin, "");
    expect(Array.isArray(r)).toBe(true);
  });

  test("terapeuta puro é barrado de listar pacientes", async () => {
    await expect(listarPacientes(ctxT1, "")).rejects.toBeInstanceOf(RoleError);
  });

  test("coordenador continua podendo listar pacientes", async () => {
    const r = await listarPacientes(ctxCoord, "");
    expect(Array.isArray(r)).toBe(true);
  });

  const regraValida = {
    patientId: PATIENT_P,
    terapeutaId: U_T1,
    disciplina: "aba",
    diaSemana: 1,
    horaInicio: "10:00",
    duracaoMin: 60,
    semanaVisivelISO: "2026-07-13",
    hojeISO: "2026-07-19",
  };

  test("cria regra com disciplina válida (vocabulário da clínica)", async () => {
    const r = await criarRegra(ctxCoord, regraValida);
    expect(r.id).toBeTruthy();
  });

  test("rejeita disciplina fora do vocabulário da clínica", async () => {
    await expect(
      criarRegra(ctxCoord, {
        ...regraValida,
        diaSemana: 2,
        disciplina: "inexistente",
      }),
    ).rejects.toThrow(/disciplina/i);
  });

  test("rejeita regra se terapeutaId não possui papel de terapeuta", async () => {
    await expect(
      criarRegra(ctxCoord, {
        ...regraValida,
        terapeutaId: U_COORD, // U_COORD é coordenador, não terapeuta
        diaSemana: 3,
      }),
    ).rejects.toThrow(/não é terapeuta/i);
  });

  const avulsaValida = {
    patientId: PATIENT_P,
    terapeutaId: U_T1,
    disciplina: "aba",
    tipo: "terapia" as const,
    dataISO: "2026-07-20",
    horaInicio: "11:00",
    duracaoMin: 60,
    modalidade: "presencial" as const,
  };

  test("rejeita avulsa se terapeutaId não possui papel de terapeuta", async () => {
    await expect(
      criarAvulsa(ctxCoord, {
        ...avulsaValida,
        terapeutaId: U_COORD,
      }),
    ).rejects.toThrow(/não é terapeuta/i);
  });

  test("reposição grava repostaDe apontando a falta original", async () => {
    await criarAvulsa(ctxCoord, { ...avulsaValida, repostaDe: FALTA_ID });
    const [nova] = await withTenant(ctxCoord, (tx) =>
      tx
        .select({ repostaDe: session.repostaDe })
        .from(session)
        .where(eq(session.repostaDe, FALTA_ID))
        .limit(1),
    );
    expect(nova?.repostaDe).toBe(FALTA_ID);
  });
});
