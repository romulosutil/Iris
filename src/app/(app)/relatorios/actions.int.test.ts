import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { StubPdfRenderer } from "@/lib/report/renderer";
import type { TenantContext } from "@/db/rls";
import { hasDb } from "@tests/integration-env";

// export-logic.ts importa server-only. Neutraliza o side-effect e importa o
// núcleo testável dinamicamente.
vi.mock("server-only", () => ({}));
const { exportarConvenioBruto } = await import("./export-logic");

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!)
  : (null as never);
const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA_ON = "33333333-3333-3333-3333-333333333333";
const TERA_OFF = "66666666-6666-6666-6666-666666666666";
const RECEP = "77777777-7777-7777-7777-777777777777";
const PAC = "44444444-4444-4444-4444-444444444444";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({
  role,
  userId,
  clinicId: CLINIC,
});
const input = {
  patientId: PAC,
  nomePaciente: "Miguel",
  periodoInicio: "2026-06-01",
  periodoFim: "2026-06-30",
};

describe.skipIf(!hasDb)("exportarConvenioBruto", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD},'Coord','c@a.test'),(${TERA_ON},'Ana','a@a.test'),(${TERA_OFF},'Bob','b@a.test'),(${RECEP},'Rec','r@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD},${CLINIC},'coordenador'),(${TERA_ON},${CLINIC},'terapeuta'),(${TERA_OFF},${CLINIC},'terapeuta'),(${RECEP},${CLINIC},'admin_recepcao')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES (${PAC}, ${TERA_ON}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, disciplina, agendada_para, estado) VALUES (gen_random_uuid(), ${CLINIC}, ${PAC}, ${TERA_ON}, 'ABA', '2026-06-10T09:00:00Z', 'realizada')`;
  });
  afterAll(async () => {
    if (hasDb) await owner.end();
  });

  test("coordenador exporta: report exportado + report_pdf + audit_log", async () => {
    const r = await exportarConvenioBruto(
      ctx("coordenador", COORD),
      input,
      new StubPdfRenderer(),
    );
    expect("hash" in r).toBe(true);
    const [rep] =
      await owner`SELECT status, tipo, gerado_por_ia FROM report WHERE patient_id=${PAC}`;
    expect(rep?.status).toBe("exportado");
    expect(rep?.tipo).toBe("convenio_bruto");
    expect(rep?.gerado_por_ia).toBe(false);
    const pdfs = await owner`SELECT 1 FROM report_pdf`;
    expect(pdfs.length).toBe(1);
    const logs =
      await owner`SELECT acao FROM audit_log WHERE acao='relatorio_exportado'`;
    expect(logs.length).toBe(1);
  });

  test("terapeuta on-team exporta próprio paciente", async () => {
    const r = await exportarConvenioBruto(
      ctx("terapeuta", TERA_ON),
      input,
      new StubPdfRenderer(),
    );
    expect("hash" in r).toBe(true);
  });

  test("terapeuta fora da equipe é bloqueado (RLS)", async () => {
    await expect(
      exportarConvenioBruto(
        ctx("terapeuta", TERA_OFF),
        input,
        new StubPdfRenderer(),
      ),
    ).rejects.toThrow();
  });

  test("admin_recepcao é bloqueado (requireRole)", async () => {
    const r = await exportarConvenioBruto(
      ctx("admin_recepcao", RECEP),
      input,
      new StubPdfRenderer(),
    );
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });
});
