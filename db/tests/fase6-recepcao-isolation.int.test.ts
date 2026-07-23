/**
 * Fase 6.2 (R6.2.4 / decisão A4) — recepção com "zero leitura clínica".
 * Codifica a decisão: `admin_recepcao` perde o SELECT do `audit_log` base (que
 * carrega patient_id + detalhe = PII) e passa a enxergar só a view MASCARADA
 * `audit_log_mascarado` (sem colunas clínicas, escopada por clínica). Roda com
 * `pnpm test:rls`. Auto-skip sem DB.
 *
 * Complementa `fase2-rls.int.test.ts` (recepção já bloqueada em
 * patient_clinical_profile / patient_protocol / care_team_membership).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_RECEP_A = "00000000-0000-0000-0000-0000000000d2";
const U_RECEP_B = "00000000-0000-0000-0000-0000000000d5";
const P1 = "00000000-0000-0000-0000-0000000000d1";
const R1 = "00000000-0000-0000-0000-0000000000f1";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("fase6.2 · isolamento recepção + auditoria mascarada", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE report, report_pdf, audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@fase6-recep.test'),
      (${U_RECEP_A}, 'Recep A', 'recep-a@fase6-recep.test'),
      (${U_RECEP_B}, 'Recep B', 'recep-b@fase6-recep.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_RECEP_B}, ${CLINIC_B}, 'admin_recepcao')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P1}, ${CLINIC_A}, 'Paciente 1')`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload)
      VALUES (${R1}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
    // Trilha COM PII clínica (patient_id + detalhe) nas duas clínicas.
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe) VALUES
      (${CLINIC_A}, ${U_COORD_A}, 'relatorio_exportado', 'report', ${R1}, ${P1}, '{"hash":"h"}'),
      (${CLINIC_B}, ${U_RECEP_B}, 'algo_clinica_b', 'report', ${R1}, NULL, NULL)`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("recepção NÃO lê o audit_log base (PII clínica bloqueada)", async () => {
    const rows = await withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
      db.execute(sql`SELECT acao, patient_id FROM audit_log`),
    );
    expect(rows).toHaveLength(0);
  });

  test("recepção lê a view mascarada, sem colunas clínicas", async () => {
    const rows = await withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
      db.execute(sql`SELECT * FROM audit_log_mascarado`),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("acao");
    expect(rows[0]).not.toHaveProperty("patient_id"); // dropada da view
    expect(rows[0]).not.toHaveProperty("detalhe");
  });

  test("view mascarada nem expõe a coluna patient_id (erro ao selecionar)", async () => {
    await expect(
      withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
        db.execute(sql`SELECT patient_id FROM audit_log_mascarado`),
      ),
    ).rejects.toThrow();
  });

  test("view mascarada é escopada por clínica (não vaza cross-tenant)", async () => {
    // Recepção A só enxerga linhas da clínica A, nunca da B.
    const rows = await withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
      db.execute(sql`SELECT clinic_id FROM audit_log_mascarado`),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.clinic_id).toBe(CLINIC_A);
  });

  test("coordenador continua lendo o audit_log base completo (regressão)", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT patient_id FROM audit_log WHERE patient_id = ${P1}::uuid`),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("terapeuta não enxerga a view mascarada (papel não autorizado)", async () => {
    // GRANT é p/ todo app_role; a view filtra por papel → terapeuta vê 0.
    const U_TER = "00000000-0000-0000-0000-0000000000a1";
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_TER}, 'Ter A', 'ter-a@fase6-recep.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_TER}, ${CLINIC_A}, 'terapeuta')`;
    const rows = await withTenant(ctx("terapeuta", U_TER), (db) =>
      db.execute(sql`SELECT id FROM audit_log_mascarado`),
    );
    expect(rows).toHaveLength(0);
  });

  test("recepção não lê tabela clínica report", async () => {
    const rows = await withTenant(ctx("admin_recepcao", U_RECEP_A), (db) =>
      db.execute(sql`SELECT id FROM report WHERE clinic_id = ${CLINIC_A}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });
});
