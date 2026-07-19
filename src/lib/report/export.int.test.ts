/**
 * Teste de integração do export transacional de relatório (Fase 5 F0).
 * Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem DB.
 *
 * Prova: export atômico (pdf congelado + status + trilha), trava de race via
 * FOR UPDATE + recheck de payload_versao, e rejeição de re-export.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { withTenant, type TenantContext } from "../../db/rls";
import { StubPdfRenderer } from "./renderer";
import { exportReport } from "./export";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;
const CLINIC_A = "00000000-0000-0000-0000-00000000000a";
const U_COORD_A = "00000000-0000-0000-0000-0000000000c1";
const P1 = "00000000-0000-0000-0000-0000000000d1";
const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;
const renderer = new StubPdfRenderer();
const buildHtml = (p: unknown) => `<h1>${JSON.stringify(p)}</h1>`;

async function seedReport(id: string) {
  await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
    VALUES (${id}, ${CLINIC_A}, ${P1}, 'familia', '2026-01-01', '2026-01-31', '{"v":1}'::jsonb)`;
}

describe.skipIf(!hasDb)("exportReport", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE clinic, app_user, user_role, patient, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_A}, 'Coord', 'coord@a.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${P1}, ${CLINIC_A}, 'Paciente 1')`;
  });

  afterAll(async () => {
    await owner?.end();
  });

  test("congela report_pdf + marca exportado + grava audit_log, atomicamente", async () => {
    const R = "00000000-0000-0000-0000-0000000000e1";
    await seedReport(R);
    const { hash } = await withTenant(ctx("coordenador", U_COORD_A), (tx) =>
      exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer }),
    );
    const [rep] = await owner!`SELECT status, pdf_hash FROM report WHERE id = ${R}`;
    const [pdf] = await owner!`SELECT hash FROM report_pdf WHERE report_id = ${R}`;
    const [log] = await owner!`SELECT acao FROM audit_log WHERE entidade_id = ${R} AND acao = 'relatorio_exportado'`;
    expect(rep!.status).toBe("exportado");
    expect(rep!.pdf_hash).toBe(hash);
    expect(pdf!.hash).toBe(hash);
    expect(log!.acao).toBe("relatorio_exportado");
  });

  test("aborta se payload_versao mudou entre leitura e commit (race)", async () => {
    const R = "00000000-0000-0000-0000-0000000000e2";
    await seedReport(R);
    // renderer que muda a versão no banco no meio do render, simulando edição concorrente
    const racingRenderer = {
      async render(html: string) {
        await owner!`UPDATE report SET payload_versao = payload_versao + 1 WHERE id = ${R}`;
        return Buffer.from(html);
      },
    };
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer: racingRenderer }),
      ),
    ).rejects.toThrow(/vers/i);
    const [rep] = await owner!`SELECT status FROM report WHERE id = ${R}`;
    expect(rep!.status).toBe("rascunho"); // não congelou payload obsoleto
  });

  test("re-export de report já exportado é rejeitado", async () => {
    const R = "00000000-0000-0000-0000-0000000000e1"; // já exportado no 1º teste
    await expect(
      withTenant(ctx("coordenador", U_COORD_A), (tx) =>
        exportReport(tx, { reportId: R, atorId: U_COORD_A, buildHtml, renderer }),
      ),
    ).rejects.toThrow(/status/i);
  });
});
