/**
 * Teste de integração do RLS de report/report_pdf/audit_log (Fase 5 F0)
 * contra Postgres real. Roda com `pnpm test:rls`. Auto-skip sem DB.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { report, reportPdf, auditLog } from "../../src/db/schema";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1"; // on team de P1
const U_TER_A2 = "00000000-0000-0000-0000-0000000000a2"; // fora da equipe de P1
const P1 = "00000000-0000-0000-0000-0000000000d1"; // clínica A
const P_B = "00000000-0000-0000-0000-0000000000db"; // clínica B
const R1 = "00000000-0000-0000-0000-0000000000f1"; // report de P1 (A)
const R_B = "00000000-0000-0000-0000-0000000000fb"; // report de P_B (B)

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("report/report_pdf/audit_log — RLS", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role, patient, care_team_membership RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@fase5.test'),
      (${U_TER_A}, 'Ter A', 'ter-a@fase5.test'),
      (${U_TER_A2}, 'Ter A2', 'ter-a2@fase5.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_TER_A2}, ${CLINIC_A}, 'terapeuta')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC_A}, 'Paciente 1'),
      (${P_B}, ${CLINIC_B}, 'Paciente B')`;
    await owner!`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe, vigencia_fim) VALUES
      (${P1}, ${U_TER_A}, 'ABA', 'terapeuta_referencia', NULL)`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload) VALUES
      (${R1}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}'),
      (${R_B}, ${CLINIC_B}, ${P_B}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("coordenador da clínica A vê report de A, não de B", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(report),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(R1);
    expect(ids).not.toContain(R_B); // isolamento cross-tenant
  });

  test("terapeuta fora da equipe de P1 não vê R1", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TER_A2), (db) =>
      db.select().from(report),
    );
    expect(rows.map((r) => r.id)).not.toContain(R1);
  });

  test("report soft-deletado fica invisível", async () => {
    await owner!`UPDATE report SET deletado_em = now() WHERE id = ${R1}`;
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(report),
    );
    expect(rows.map((r) => r.id)).not.toContain(R1);
    await owner!`UPDATE report SET deletado_em = NULL WHERE id = ${R1}`;
  });

  test("report_pdf cross-tenant → 0 linhas", async () => {
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R_B}, '\\x00', 'h') ON CONFLICT DO NOTHING`;
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.select().from(reportPdf),
    );
    expect(rows.map((r) => r.reportId)).not.toContain(R_B);
  });

  test("audit_log: INSERT com ator_id ≠ sessão é rejeitado (ator amarrado)", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
          VALUES (${CLINIC_A}::uuid, ${U_TER_A}::uuid, 'x', 'report', ${R1}::uuid)`),
      ),
    ).rejects.toThrow();
  });

  test("audit_log: UPDATE/DELETE por app_role falham (append-only)", async () => {
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
      VALUES (${CLINIC_A}, ${U_COORD_A}, 'relatorio_exportado', 'report', ${R1})`;
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`DELETE FROM audit_log WHERE clinic_id = ${CLINIC_A}::uuid`),
      ),
    ).rejects.toThrow();
  });

  test("audit_log: terapeuta não lê a trilha", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TER_A), (db) =>
      db.select().from(auditLog),
    );
    expect(rows).toHaveLength(0);
  });
});
