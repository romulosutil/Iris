/**
 * Teste de integração do RLS multi-tenant (Fase 1) contra Postgres real.
 * Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem DB.
 *
 * Prova os guardrails: admin_recepcao NÃO lê tabela clínica; terapeuta só vê
 * pacientes de equipe vigente; isolamento cross-clinic; escrita clínica negada
 * à recepção.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { patient, patientClinicalProfile } from "./schema";
import { withTenant, type TenantContext } from "./rls";
import { sql as appSql } from "./client";

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

// UUIDs fixos para determinismo.
const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002"; // na equipe de P1
const U_TERA2 = "a0000000-0000-0000-0000-000000000003"; // sem equipe
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
const P1 = "b0000000-0000-0000-0000-000000000001"; // clinic A, equipe = TERA
const P2 = "b0000000-0000-0000-0000-000000000002"; // clinic A, sem equipe p/ TERA
const P3 = "b0000000-0000-0000-0000-000000000003"; // clinic B
const P4 = "b0000000-0000-0000-0000-000000000004"; // clinic A, sem profile, sem equipe

const ctx = (
  role: TenantContext["role"],
  userId: string,
  clinicId = CLINIC_A,
) => ({ role, userId, clinicId }) satisfies TenantContext;

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("RLS multi-tenant — Fase 1", () => {
  beforeAll(async () => {
    // Seed como superuser (iris) — bypassa RLS.
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, patient, patient_clinical_profile, care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test'),
      (${U_TERA2}, 'Tera2', 'tera2@a.test'),
      (${U_ADMIN}, 'Admin', 'admin@a.test')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC_A}, 'Paciente 1'),
      (${P2}, ${CLINIC_A}, 'Paciente 2'),
      (${P3}, ${CLINIC_B}, 'Paciente 3'),
      (${P4}, ${CLINIC_A}, 'Paciente 4')`;
    await owner`INSERT INTO patient_clinical_profile (patient_id, diagnostico) VALUES
      (${P1}, 'hipótese TEA'), (${P2}, 'em avaliação')`;
    // TERA está na equipe vigente de P1; TERA2 não; nenhum vínculo p/ P2.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${P1}, ${U_TERA}, 'ABA', 'terapeuta_referencia')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("admin_recepcao vê pacientes (administrativo) mas NÃO o perfil clínico", async () => {
    const pacientes = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patient),
    );
    expect(pacientes.map((p) => p.id).sort()).toEqual([P1, P2, P4].sort());

    const clinico = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patientClinicalProfile),
    );
    expect(clinico).toHaveLength(0); // BLOQUEADO
  });

  test("terapeuta só vê pacientes da própria equipe vigente", async () => {
    const pacientes = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db.select().from(patient),
    );
    expect(pacientes.map((p) => p.id)).toEqual([P1]); // só P1, não P2
  });

  test("terapeuta sem equipe não vê nenhum paciente da clínica", async () => {
    const pacientes = await withTenant(ctx("terapeuta", U_TERA2), (db) =>
      db.select().from(patient),
    );
    expect(pacientes).toHaveLength(0);
  });

  test("coordenador vê a clínica inteira, mas não outra clínica", async () => {
    const pacientes = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.select().from(patient),
    );
    const ids = pacientes.map((p) => p.id).sort();
    expect(ids).toEqual([P1, P2, P4].sort());
    expect(ids).not.toContain(P3); // isolamento cross-clinic
  });

  test("admin_recepcao NÃO consegue inserir perfil clínico (RLS write)", async () => {
    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db
          .insert(patientClinicalProfile)
          .values({ patientId: P1, diagnostico: "hack" }),
      ),
    ).rejects.toThrow();
  });

  test("terapeuta fora da equipe NÃO insere perfil clínico do paciente (RLS write)", async () => {
    // P4 não tem profile (isola do unique constraint) e TERA2 não está na sua
    // equipe → o WITH CHECK de pcp_access deve barrar a inserção.
    await expect(
      withTenant(ctx("terapeuta", U_TERA2), (db) =>
        db
          .insert(patientClinicalProfile)
          .values({ patientId: P4, diagnostico: "hack" }),
      ),
    ).rejects.toThrow();
  });
});
