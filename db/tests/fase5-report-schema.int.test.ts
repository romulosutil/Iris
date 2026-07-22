/**
 * Fase 5 (F0) — DDL de `report`, `report_pdf`, `audit_log`.
 * Conexão owner (bypassa RLS) só para provar que as CHECKs do banco existem
 * e rejeitam. Mesmo padrão de conexão/skip de db/tests/fase4-evidence-rls.int.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 }) : null;

// UUIDs fixos de seed mínimo (clínica + paciente + user).
const CLINIC = "00000000-0000-0000-0000-0000000000c1";
const USER = "00000000-0000-0000-0000-0000000000a1";
const PATIENT = "00000000-0000-0000-0000-0000000000b1";

describe.skipIf(!hasDb)("report — constraints de banco", () => {
  beforeAll(async () => {
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C1') ON CONFLICT DO NOTHING`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${USER}, 'U', 'u@e.com') ON CONFLICT DO NOTHING`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC}, 'P') ON CONFLICT DO NOTHING`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("periodo_fim < periodo_inicio é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-02-01', '2026-01-01', '{}'::jsonb)`,
    ).rejects.toThrow();
  });

  test("convenio_bruto com gerado_por_ia=true é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, gerado_por_ia)
             VALUES (${CLINIC}, ${PATIENT}, 'convenio_bruto', '2026-01-01', '2026-01-31', '{}'::jsonb, true)`,
    ).rejects.toThrow();
  });

  test("convenio_narrativo com gerado_por_ia=false é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, status, gerado_por_ia)
             VALUES (${CLINIC}, ${PATIENT}, 'convenio_narrativo', '2026-01-01', '2026-01-31', '{}'::jsonb, 'rascunho', false)`,
    ).rejects.toThrow(/report_narrativo_com_ia/);
  });

  test("status=exportado sem pdf_hash/exportado_por/exportado_em é rejeitado", async () => {
    await expect(
      owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload, status)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-01-01', '2026-01-31', '{}'::jsonb, 'exportado')`,
    ).rejects.toThrow();
  });

  test("report rascunho válido insere e payload_versao default = 1", async () => {
    const [r] = await owner!`INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, payload)
             VALUES (${CLINIC}, ${PATIENT}, 'familia', '2026-01-01', '2026-01-31', '{"x":1}'::jsonb)
             RETURNING payload_versao, status`;
    expect(r!.payload_versao).toBe(1);
    expect(r!.status).toBe("rascunho");
  });
});
