/**
 * Teste de integração da purga rastreada `app_purgar_report` (Fase 5 F0)
 * contra Postgres real. Roda com `pnpm test:rls`. Auto-skip sem DB.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_ADMIN_A = "00000000-0000-0000-0000-0000000000d2";
const U_TER_A = "00000000-0000-0000-0000-0000000000a1";
const P1 = "00000000-0000-0000-0000-0000000000d1";
const R1 = "00000000-0000-0000-0000-0000000000f1";

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("app_purgar_report", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role, patient, care_team_membership RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@fase5-purga.test'),
      (${U_ADMIN_A}, 'Admin A', 'admin-a@fase5-purga.test'),
      (${U_TER_A}, 'Ter A', 'ter-a@fase5-purga.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_ADMIN_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_TER_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P1}, ${CLINIC_A}, 'Paciente 1')`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload) VALUES
      (${R1}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R1}, '\\x00', 'hash-r1')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("purga grava audit_log ANTES e remove report + report_pdf (cascata)", async () => {
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT app_purgar_report(${R1}::uuid, 'fim de retenção')`),
    );
    const rep = await owner!`SELECT 1 FROM report WHERE id = ${R1}`;
    const pdf = await owner!`SELECT 1 FROM report_pdf WHERE report_id = ${R1}`;
    const log = await owner!`SELECT acao FROM audit_log WHERE entidade_id = ${R1} AND acao = 'relatorio_purgado'`;
    expect(rep).toHaveLength(0);
    expect(pdf).toHaveLength(0);
    expect(log).toHaveLength(1); // trilha sobrevive ao delete (entidade_id sem FK)
  });

  test("terapeuta não pode executar a purga", async () => {
    await expect(
      withTenant(ctx("terapeuta", U_TER_A), (db) =>
        db.execute(sql`SELECT app_purgar_report(${R1}::uuid, 'x')`),
      ),
    ).rejects.toThrow();
  });

  test("admin_recepcao NÃO lê o audit_log base após 6.2 (A4 — path removido)", async () => {
    // A policy audit_select agora é coordenador-only (0046). Recepção lê só a
    // view mascarada (coberto em fase6-recepcao-isolation).
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
      VALUES (${CLINIC_A}, ${U_COORD_A}, 'relatorio_exportado', 'report', ${R1})`;
    const rows = await withTenant(ctx("admin_recepcao", U_ADMIN_A), (db) =>
      db.execute(sql`SELECT acao FROM audit_log WHERE clinic_id = ${CLINIC_A}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });
});
