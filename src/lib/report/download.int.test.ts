/**
 * Teste de integração de re-download do snapshot congelado (Fase 5 F0).
 * Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem DB.
 *
 * Prova: getReportPdf devolve os bytes congelados (round-trip byte-a-byte
 * confere com o hash gravado) e nunca re-renderiza; RLS esconde reports de
 * outra clínica (retorna null).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant, type TenantContext } from "../../db/rls";
import { sha256Hex } from "./hash";
import { StubPdfRenderer } from "./renderer";
import { exportReport } from "./export";
import { getReportPdf } from "./download";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;
const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const CLINIC_B = "00000000-0000-0000-0000-00000000000b";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const U_COORD_B = "00000000-0000-0000-0000-0000000000c2";
const P1 = "00000000-0000-0000-0000-0000000000d1";
const P2 = "00000000-0000-0000-0000-0000000000d2";
const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;
const renderer = new StubPdfRenderer();
const buildHtml = (p: unknown) => `<h1>${JSON.stringify(p)}</h1>`;

const R = "00000000-0000-0000-0000-0000000000f1";
const R_B = "00000000-0000-0000-0000-0000000000f2";

describe.skipIf(!hasDb)("getReportPdf", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE clinic, app_user, user_role, patient, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A'), (${CLINIC_B}, 'Clínica B')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_A}, 'Coord', 'coord@a.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P1}, ${CLINIC_A}, 'Paciente 1'), (${P2}, ${CLINIC_B}, 'Paciente 2')`;

    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
      VALUES (${R}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', '{"v":1}'::jsonb)`;
    await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer }),
    );

    // Report de outra clínica, também exportado, mas invisível ao coordenador da clínica A (RLS).
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_B}, 'Coord B', 'coord@b.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, status, pdf_hash, exportado_por, exportado_em)
      VALUES (${R_B}, ${CLINIC_B}, ${P2}, 'familia', '2026-01-01', '2026-01-31', '{"v":1}'::jsonb, 'exportado', 'deadbeef', ${U_COORD_B}, now())`;
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R_B}, ${Buffer.from("outro")}, 'deadbeef')`;
  });

  afterAll(async () => {
    await owner?.end();
  });

  test("getReportPdf devolve os bytes congelados, hash idêntico", async () => {
    const out = await withTenant(ctx("coordenador", U_COORD_A), (tx) => getReportPdf(tx, R));
    expect(out).not.toBeNull();
    expect(sha256Hex(out!.bytes)).toBe(out!.hash);
  });

  test("report de outra clínica → null (RLS)", async () => {
    const out = await withTenant(ctx("coordenador", U_COORD_A), (tx) => getReportPdf(tx, R_B));
    expect(out).toBeNull();
  });
});
