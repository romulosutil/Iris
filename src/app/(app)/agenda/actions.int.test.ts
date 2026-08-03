import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// actions.ts puxa getTenantContext (next/headers) → server-only. Neutraliza o
// side-effect e importa o núcleo testável dinamicamente.
vi.mock("server-only", () => ({}));
const { checkInSessao, listarSessoesDoDia, marcarEstado } =
  await import("./logic");
const { pendentesDeConsolidacao, reposicoesPendentes } =
  await import("./queries");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { session } = await import("@/db/schema");

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
// Slots distintos para os testes que PERSISTEM uma sessão do mesmo terapeuta
// (U_T1): o EXCLUDE anti-overbook (Agenda 2.0) barra duas 'agendada' do mesmo
// terapeuta em horários sobrepostos. Faixas de 1h não se sobrepõem (range
// meia-aberto), então 13:00 e 14:00 convivem com a de 12:00.
const AGENDADA_CHECKIN = "2026-07-11T13:00:00-03:00";
const AGENDADA_UPDATE = "2026-07-11T14:00:00-03:00";
const AGENDADA_MARCAR_1 = "2026-07-11T15:00:00-03:00";
const AGENDADA_MARCAR_2 = "2026-07-11T16:00:00-03:00";
const DIA = "2026-07-11";

let owner: ReturnType<typeof postgres>;

/**
 * O form legado de UUID (`agendarSessao`) foi aposentado na etapa E+F — quem
 * cria sessão hoje é `/agenda/semana` (criarAvulsa/materializarRegra). Aqui só
 * precisamos de uma sessão persistida para exercitar `listarSessoesDoDia` e
 * `checkInSessao`; inserimos direto via cliente owner (bypassa RLS, como o
 * resto do seed deste describe).
 */
async function criarSessao(params: {
  patientId: string;
  terapeutaId: string;
  agendadaPara: string;
  disciplina?: string;
  estado?: string;
  repostaDe?: string;
}): Promise<string> {
  const [row] = await owner<{ id: string }[]>`
    INSERT INTO session (clinic_id, patient_id, terapeuta_id, agendada_para, disciplina, estado, reposta_de)
    VALUES (
      ${CLINIC_A}, ${params.patientId}, ${params.terapeutaId}, ${params.agendadaPara},
      ${params.disciplina ?? "psicologia"}, ${params.estado ?? "agendada"}, ${params.repostaDe ?? null}
    )
    RETURNING id
  `;
  return row!.id;
}

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
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

  test("coordenação enxerga a sessão na grade do dia", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: AGENDADA_PARA,
    });

    const grade = await listarSessoesDoDia(ctxCoord, DIA);
    const linha = grade.find((s) => s.id === id);
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

  test("check-in registra presença (checkInEm) sem mudar estado e é idempotente-seguro", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: AGENDADA_CHECKIN,
    });

    const ok = await checkInSessao(ctxT1, id);
    expect(ok.error).toBeUndefined();

    const [depois] = await withTenant(ctxCoord, (tx) =>
      tx.select().from(session).where(eq(session.id, id)),
    );
    expect(depois!.estado).toBe("agendada");
    expect(depois!.checkInEm).not.toBeNull();

    // Segundo check-in não encontra mais uma sessão 'agendada' → no-op seguro.
    const denovo = await checkInSessao(ctxT1, id);
    expect(denovo.error).toMatch(/já iniciada|não encontrada/i);
  });

  test("UPDATE não reaponta a sessão para paciente/profissional de outra clínica", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: AGENDADA_UPDATE,
    });

    // Reapontar patient_id para paciente da clínica B, mantendo clinic_id local:
    // o WITH CHECK (app_patient_in_clinic) precisa barrar — FK bypassa RLS.
    await expect(
      withTenant(ctxCoord, (tx) =>
        tx
          .update(session)
          .set({ patientId: PATIENT_B })
          .where(eq(session.id, id)),
      ),
    ).rejects.toThrow();

    // Idem para terapeuta_id de outra clínica (app_user_in_clinic).
    await expect(
      withTenant(ctxCoord, (tx) =>
        tx.update(session).set({ terapeutaId: U_B }).where(eq(session.id, id)),
      ),
    ).rejects.toThrow();
  });

  test("marca realizada uma vez; 2ª chamada (estado já mudou) devolve erro", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: AGENDADA_MARCAR_1,
      disciplina: "aba",
    });

    const a = await marcarEstado(ctxCoord, {
      sessionId: id,
      estado: "realizada",
    });
    expect(a.ok).toBe(true);

    const b = await marcarEstado(ctxCoord, {
      sessionId: id,
      estado: "falta_paciente",
    });
    expect(b.error).toMatch(/já foi atualizada/i);
  });

  test("substituto de outra clínica é rejeitado", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: AGENDADA_MARCAR_2,
      disciplina: "aba",
    });

    const r = await marcarEstado(ctxCoord, {
      sessionId: id,
      estado: "realizada",
      atendidoPorId: U_B,
    });
    expect(r.error).toMatch(/substitut|terapeuta/i);
  });

  test("sessão agendada no passado aparece em pendentesDeConsolidacao", async () => {
    const id = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: "2020-01-10T12:00:00-03:00", // bem no passado
    });

    const pend = await pendentesDeConsolidacao(ctxCoord);
    expect(pend.map((s) => s.id)).toContain(id);
  });

  test("falta sem reposição aparece como pendente; com reposição, some", async () => {
    const semRepor = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: "2026-07-11T17:00:00-03:00",
      estado: "falta_paciente",
    });
    const comRepor = await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: "2026-07-11T18:00:00-03:00",
      estado: "falta_paciente",
    });
    await criarSessao({
      patientId: PATIENT_P,
      terapeutaId: U_T1,
      agendadaPara: "2026-07-18T09:00:00-03:00",
      estado: "agendada",
      repostaDe: comRepor,
    });

    const pend = await reposicoesPendentes(ctxCoord);
    const ids = pend.map((s) => s.id);
    expect(ids).toContain(semRepor);
    expect(ids).not.toContain(comRepor);
  });
});
