import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";

// actions.ts puxa getTenantContext (next/headers) → server-only. Neutraliza o
// side-effect e importa o núcleo testável dinamicamente.
vi.mock("server-only", () => ({}));
const { agendarSessao, checkInSessao, listarSessoesDoDia } = await import(
  "./actions"
);
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { session } = await import("@/db/schema");

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_T1 = "a0000000-0000-0000-0000-000000000002"; // terapeuta, da equipe de P
const U_T2 = "a0000000-0000-0000-0000-000000000003"; // terapeuta, fora da equipe
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
const U_B = "b0000000-0000-0000-0000-000000000001"; // usuário só da clínica B
const PATIENT_P = "cccccccc-0000-0000-0000-000000000001"; // clínica A
const PATIENT_B = "dddddddd-0000-0000-0000-000000000001"; // clínica B

// Instante determinístico (offset explícito) — 12:00 em São Paulo, 11/07/2026.
const AGENDADA_PARA = "2026-07-11T12:00:00-03:00";
const DIA = "2026-07-11";

let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const ctxCoord = { clinicId: CLINIC_A, userId: U_COORD, role: "coordenador" } as const;
const ctxAdmin = { clinicId: CLINIC_A, userId: U_ADMIN, role: "admin_recepcao" } as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;

describe.skipIf(!hasDb)("agenda — sessão + check-in (RLS)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord A', 'coord@a.test'),
      (${U_T1}, 'Terapeuta Um', 't1@a.test'),
      (${U_T2}, 'Terapeuta Dois', 't2@a.test'),
      (${U_ADMIN}, 'Recepção A', 'adm@a.test'),
      (${U_B}, 'Usuário B', 'u@b.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PATIENT_P}, ${CLINIC_A}, 'Paciente P'),
      (${PATIENT_B}, ${CLINIC_B}, 'Paciente B')`;
    // T1 é da equipe de cuidado de P; T2 não é.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PATIENT_P}, ${U_T1}, 'psicologia', 'terapeuta_referencia')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("recepção agenda e a coordenação enxerga a sessão na grade do dia", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_T1, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.error).toBeUndefined();
    expect(r.id).toBeDefined();

    const grade = await listarSessoesDoDia(ctxCoord, DIA);
    const linha = grade.find((s) => s.id === r.id);
    expect(linha).toBeDefined();
    expect(linha!.estado).toBe("agendada");
    expect(linha!.pacienteNome).toBe("Paciente P");
    expect(linha!.terapeutaNome).toBe("Terapeuta Um");
  });

  test("terapeuta da sessão vê na grade; terapeuta de fora não vê", async () => {
    const gradeT1 = await listarSessoesDoDia(ctxT1, DIA);
    expect(gradeT1.length).toBeGreaterThan(0);
    expect(gradeT1.every((s) => s.terapeutaId === U_T1)).toBe(true);

    const gradeT2 = await listarSessoesDoDia(ctxT2, DIA);
    expect(gradeT2).toHaveLength(0);
  });

  test("terapeuta não pode agendar (guardrail de papel)", async () => {
    await expect(
      agendarSessao(
        ctxT1,
        form({ patientId: PATIENT_P, terapeutaId: U_T1, agendadaPara: AGENDADA_PARA }),
      ),
    ).rejects.toThrow(/terapeuta/);
  });

  test("check-in transiciona agendada → presente e é idempotente-seguro", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_T1, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.id).toBeDefined();

    const ok = await checkInSessao(ctxT1, r.id!);
    expect(ok.error).toBeUndefined();

    const [depois] = await withTenant(ctxCoord, (tx) =>
      tx.select().from(session).where(eq(session.id, r.id!)),
    );
    expect(depois!.estado).toBe("presente");
    expect(depois!.checkInEm).not.toBeNull();

    // Segundo check-in não encontra mais uma sessão 'agendada' → no-op seguro.
    const denovo = await checkInSessao(ctxT1, r.id!);
    expect(denovo.error).toMatch(/já iniciada|não encontrada/i);
  });

  test("datetime-local sem fuso é ancorado no fuso da clínica (não no do servidor)", async () => {
    // Entrada crua do <input type="datetime-local"> — sem offset.
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_T1, agendadaPara: "2026-07-11T09:00" }),
    );
    expect(r.error).toBeUndefined();

    const grade = await listarSessoesDoDia(ctxCoord, DIA);
    const linha = grade.find((s) => s.id === r.id);
    expect(linha).toBeDefined();
    // 09:00 em São Paulo (UTC-3) = 12:00 UTC — resultado fixo, seja qual for o
    // fuso do ambiente que roda o teste/servidor.
    expect(linha!.agendadaPara.toISOString()).toBe("2026-07-11T12:00:00.000Z");
  });

  test("cross-tenant: recepção não agenda paciente de outra clínica", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_B, terapeutaId: U_T1, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.error).toBeDefined();
    expect(r.id).toBeUndefined();
  });

  test("cross-tenant: recepção não agenda com profissional de outra clínica", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_B, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.error).toBeDefined();
    expect(r.id).toBeUndefined();
  });

  test("não vincula sessão a quem não é terapeuta (coordenador sem role terapeuta)", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_COORD, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.error).toMatch(/terapeuta/i);
    expect(r.id).toBeUndefined();
  });

  test("UPDATE não reaponta a sessão para paciente/profissional de outra clínica", async () => {
    const r = await agendarSessao(
      ctxAdmin,
      form({ patientId: PATIENT_P, terapeutaId: U_T1, agendadaPara: AGENDADA_PARA }),
    );
    expect(r.id).toBeDefined();

    // Reapontar patient_id para paciente da clínica B, mantendo clinic_id local:
    // o WITH CHECK (app_patient_in_clinic) precisa barrar — FK bypassa RLS.
    await expect(
      withTenant(ctxCoord, (tx) =>
        tx
          .update(session)
          .set({ patientId: PATIENT_B })
          .where(eq(session.id, r.id!)),
      ),
    ).rejects.toThrow();

    // Idem para terapeuta_id de outra clínica (app_user_in_clinic).
    await expect(
      withTenant(ctxCoord, (tx) =>
        tx
          .update(session)
          .set({ terapeutaId: U_B })
          .where(eq(session.id, r.id!)),
      ),
    ).rejects.toThrow();
  });
});
