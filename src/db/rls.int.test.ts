/**
 * Teste de integração do RLS multi-tenant (Fase 1) contra Postgres real.
 * Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem DB.
 *
 * Prova os guardrails: admin_recepcao NÃO lê tabela clínica; terapeuta só vê
 * pacientes de equipe vigente; isolamento cross-clinic; escrita clínica negada
 * à recepção.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  careTeamMembership,
  patient,
  patientClinicalProfile,
  patientProtocol,
  report,
} from "./schema";
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
const U_TERA3 = "a0000000-0000-0000-0000-000000000005"; // também na equipe de P1
const U_EXT = "a0000000-0000-0000-0000-000000000006"; // papel só na clínica B
const P1 = "b0000000-0000-0000-0000-000000000001"; // clinic A, equipe = TERA
const P2 = "b0000000-0000-0000-0000-000000000002"; // clinic A, sem equipe p/ TERA
const P3 = "b0000000-0000-0000-0000-000000000003"; // clinic B
const P4 = "b0000000-0000-0000-0000-000000000004"; // clinic A, sem profile, sem equipe
const PROT_A = "c0000000-0000-0000-0000-000000000001"; // protocolo da clínica A
const PROT_B = "c0000000-0000-0000-0000-000000000002"; // protocolo da clínica B

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
    await owner`TRUNCATE clinic, app_user, user_role, patient, patient_clinical_profile, care_team_membership, protocol, patient_protocol RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test'),
      (${U_TERA2}, 'Tera2', 'tera2@a.test'),
      (${U_ADMIN}, 'Admin', 'admin@a.test'),
      (${U_TERA3}, 'Tera3', 'tera3@a.test'),
      (${U_EXT}, 'Ext', 'ext@b.test')`;
    // Papéis por clínica (user_role): TERA3 é da clínica A; U_EXT só da B.
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA3}, ${CLINIC_A}, 'terapeuta'),
      (${U_EXT}, ${CLINIC_B}, 'terapeuta')`;
    // Família do catálogo: semear explicitamente (idempotente). Outra suíte de
    // integração pode ter dado TRUNCATE ... CASCADE em protocol_familia_catalogo,
    // apagando o seed da migração — sem isto o FK protocol.familia falha.
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      ('fonoaudiologia', 'Fonoaudiologia') ON CONFLICT (id) DO NOTHING`;
    // Protocolos por clínica (família do catálogo).
    await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
      (${PROT_A}, ${CLINIC_A}, 'Proto A', 'Fono', 'fonoaudiologia'),
      (${PROT_B}, ${CLINIC_B}, 'Proto B', 'Fono', 'fonoaudiologia')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC_A}, 'Paciente 1'),
      (${P2}, ${CLINIC_A}, 'Paciente 2'),
      (${P3}, ${CLINIC_B}, 'Paciente 3'),
      (${P4}, ${CLINIC_A}, 'Paciente 4')`;
    await owner`INSERT INTO patient_clinical_profile (patient_id, diagnostico) VALUES
      (${P1}, 'hipótese TEA'), (${P2}, 'em avaliação')`;
    // TERA e TERA3 na equipe vigente de P1; TERA2 não; nenhum vínculo p/ P2.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${P1}, ${U_TERA}, 'ABA', 'terapeuta_referencia'),
      (${P1}, ${U_TERA3}, 'Fono', 'terapeuta_referencia')`;
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

  test("terapeuta da equipe vê a EQUIPE INTEIRA do paciente, não só a própria linha", async () => {
    // TERA está na equipe de P1 → deve enxergar também o colega TERA3 (W2).
    const equipe = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, P1)),
    );
    const membros = equipe.map((m) => m.userId).sort();
    expect(membros).toEqual([U_TERA, U_TERA3].sort());
  });

  test("terapeuta da equipe ATUALIZA perfil clínico (split não quebrou escrita legítima)", async () => {
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .update(patientClinicalProfile)
        .set({ diagnostico: "TEA confirmado" })
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const [perfil] = await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(perfil?.diagnostico).toBe("TEA confirmado");
  });

  test("pp_write: coordenador NÃO vincula protocolo de OUTRA clínica ao paciente", async () => {
    // FK não valida tenant → sem app_protocol_in_clinic, PROT_B (clínica B)
    // entraria num paciente da clínica A. WITH CHECK deve barrar.
    await expect(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.insert(patientProtocol).values({
          patientId: P2,
          protocolId: PROT_B,
          ativadoPor: U_COORD,
        }),
      ),
    ).rejects.toThrow();
  });

  test("pp_write: coordenador vincula protocolo da PRÓPRIA clínica (não superbloqueia)", async () => {
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.insert(patientProtocol).values({
        patientId: P2,
        protocolId: PROT_A,
        ativadoPor: U_COORD,
      }),
    );
    const vinculos = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientProtocol)
        .where(eq(patientProtocol.patientId, P2)),
    );
    expect(vinculos).toHaveLength(1);
  });

  test("ctm_write: coordenador NÃO adiciona profissional de OUTRA clínica à equipe", async () => {
    // U_EXT só tem papel na clínica B → app_user_in_clinic(U_EXT) é falso em A.
    await expect(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.insert(careTeamMembership).values({
          patientId: P2,
          userId: U_EXT,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
        }),
      ),
    ).rejects.toThrow();
  });

  test("ctm_write: coordenador adiciona profissional da PRÓPRIA clínica (não superbloqueia)", async () => {
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.insert(careTeamMembership).values({
        patientId: P2,
        userId: U_TERA3,
        disciplina: "Fono",
        papelNaEquipe: "terapeuta_referencia",
      }),
    );
    const equipe = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, P2)),
    );
    expect(equipe.map((m) => m.userId)).toContain(U_TERA3);
  });

  test("DELETE de perfil clínico: terapeuta da equipe é barrado, coordenador não", async () => {
    // Terapeuta (mesmo da equipe) não deve deletar dado de saúde: DELETE só tem
    // política p/ coordenador → 0 linhas afetadas, perfil permanece (W1).
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db
        .delete(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const aindaExiste = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(aindaExiste).toHaveLength(1);

    // Coordenador deleta de fato.
    await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .delete(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    const removido = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(patientClinicalProfile)
        .where(eq(patientClinicalProfile.patientId, P1)),
    );
    expect(removido).toHaveLength(0);
  });

  test("admin_recepcao NUNCA lê nem escreve patient_protocol ou care_team_membership (guardrail 1c)", async () => {
    // Minimização LGPD: recepção não toca protocolo nem equipe de cuidado.
    // RLS já barra desde 1a/1b — esta é a prova documental do guardrail #1.
    const protocolos = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(patientProtocol),
    );
    expect(protocolos).toHaveLength(0);

    const equipe = await withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
      db.select().from(careTeamMembership),
    );
    expect(equipe).toHaveLength(0);

    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db
          .insert(patientProtocol)
          .values({ patientId: P1, protocolId: PROT_A, ativadoPor: U_ADMIN }),
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db.insert(careTeamMembership).values({
          patientId: P1,
          userId: U_ADMIN,
          disciplina: "ABA",
          papelNaEquipe: "substituto",
        }),
      ),
    ).rejects.toThrow();
  });

  test("report_scope (WITH CHECK): terapeuta da equipe insere report convenio_bruto do próprio paciente", async () => {
    // TERA está na equipe de P1 (seed do describe) → INSERT deve passar.
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db.insert(report).values({
        clinicId: CLINIC_A,
        patientId: P1,
        tipo: "convenio_bruto",
        periodoInicio: "2026-06-01",
        periodoFim: "2026-06-30",
        payload: {},
      }),
    );
    const linhas = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db
        .select()
        .from(report)
        .where(eq(report.patientId, P1)),
    );
    expect(linhas).toHaveLength(1);
  });

  test("report_scope (WITH CHECK): terapeuta FORA da equipe é barrado no INSERT de report", async () => {
    // TERA2 não está na equipe de P2 → WITH CHECK (app_is_on_team) deve barrar.
    await expect(
      withTenant(ctx("terapeuta", U_TERA2), (db) =>
        db.insert(report).values({
          clinicId: CLINIC_A,
          patientId: P2,
          tipo: "convenio_bruto",
          periodoInicio: "2026-06-01",
          periodoFim: "2026-06-30",
          payload: {},
        }),
      ),
    ).rejects.toThrow();
  });

  test("report_scope (WITH CHECK): admin_recepcao (sem membership) é barrado no INSERT de report", async () => {
    // admin_recepcao nunca satisfaz coordenador OU app_is_on_team → sempre barrado.
    await expect(
      withTenant(ctx("admin_recepcao", U_ADMIN), (db) =>
        db.insert(report).values({
          clinicId: CLINIC_A,
          patientId: P1,
          tipo: "convenio_bruto",
          periodoInicio: "2026-06-01",
          periodoFim: "2026-06-30",
          payload: {},
        }),
      ),
    ).rejects.toThrow();
  });
});
