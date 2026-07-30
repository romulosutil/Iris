import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { StubPdfRenderer } from "@/lib/report/renderer";
import type { TenantContext } from "@/db/rls";
import type { FamilyReportDraft } from "@/lib/report/familia/types";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { gerarRascunhoFamilia, curarFamilia, exportarFamilia } =
  await import("./familia-logic");

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
const gerarInput = {
  patientId: PAC,
  periodoInicio: "2026-06-01",
  periodoFim: "2026-06-30",
};

const draftOk: FamilyReportDraft = {
  conquistaDestaque: "Miguel avançou em pedir o que quer.",
  trabalhandoAgora: ["Pedir o que quer"],
  comoApoiarEmCasa: ["Espere alguns segundos antes de oferecer."],
  periodoSemAvancoVisivel: false,
  notaHonestidade: null,
  anexoDados: { evidenciasPorMeta: [], avaliacoesFormaisPeriodo: [] },
  status: "rascunho_para_revisao",
};

let reportId = "";

describe.skipIf(!hasDb)("Relatório de Família — máquina de curadoria", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, goal, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD},'Coord','c@a.test'),(${TERA_ON},'Ana','a@a.test'),(${TERA_OFF},'Bob','b@a.test'),(${RECEP},'Rec','r@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD},${CLINIC},'coordenador'),(${TERA_ON},${CLINIC},'terapeuta'),(${TERA_OFF},${CLINIC},'terapeuta'),(${RECEP},${CLINIC},'admin_recepcao')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES (${PAC}, ${TERA_ON}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por) VALUES (gen_random_uuid(), ${PAC}, ${CLINIC}, 'Pedir o que quer', 'ativa', '{"tipo":"n","valor":3}', ${COORD})`;
  });
  afterAll(async () => {
    if (hasDb) await owner.end();
  });

  test("terapeuta on-team gera rascunho IA (status rascunho, gerado_por_ia, curado null)", async () => {
    const r = await gerarRascunhoFamilia(ctx("terapeuta", TERA_ON), gerarInput);
    expect("reportId" in r).toBe(true);
    reportId = (r as { reportId: string }).reportId;
    const [rep] =
      await owner`SELECT status, tipo, gerado_por_ia, payload_versao, payload FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("rascunho");
    expect(rep?.tipo).toBe("familia");
    expect(rep?.gerado_por_ia).toBe(true);
    expect(rep?.payload_versao).toBe(1);
    expect(rep?.payload.curado).toBeNull();
    expect(rep?.payload.iaOriginal.trabalhandoAgora).toContain(
      "Pedir o que quer",
    );
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_rascunho_gerado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("exportar antes de curar é bloqueado (gate F9)", async () => {
    const r = await exportarFamilia(
      ctx("coordenador", COORD),
      { reportId },
      new StubPdfRenderer(),
    );
    expect(r).toEqual({ error: expect.stringContaining("revisado") });
  });

  test("terapeuta não pode curar (papel)", async () => {
    const r = await curarFamilia(ctx("terapeuta", TERA_ON), {
      reportId,
      versaoEsperada: 1,
      draftEditado: draftOk,
    });
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("coordenador cura: status revisado, versao++, revisado_por, curado gravado", async () => {
    const r = await curarFamilia(ctx("coordenador", COORD), {
      reportId,
      versaoEsperada: 1,
      draftEditado: draftOk,
    });
    expect(r).toEqual({ ok: true });
    const [rep] =
      await owner`SELECT status, payload_versao, revisado_por, payload FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("revisado");
    expect(rep?.payload_versao).toBe(2);
    expect(rep?.revisado_por).toBe(COORD);
    expect(rep?.payload.curado.conquistaDestaque).toContain("Miguel");
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_revisado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("curar com versão obsoleta falha (trava otimista)", async () => {
    const r = await curarFamilia(ctx("coordenador", COORD), {
      reportId,
      versaoEsperada: 1,
      draftEditado: draftOk,
    });
    expect("error" in r).toBe(true);
  });

  test("terapeuta não pode exportar (papel)", async () => {
    const r = await exportarFamilia(
      ctx("terapeuta", TERA_ON),
      { reportId },
      new StubPdfRenderer(),
    );
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("coordenador exporta após revisão: exportado + pdf + audit", async () => {
    const r = await exportarFamilia(
      ctx("coordenador", COORD),
      { reportId },
      new StubPdfRenderer(),
    );
    expect("hash" in r).toBe(true);
    const [rep] = await owner`SELECT status FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("exportado");
    const pdfs =
      await owner`SELECT 1 FROM report_pdf WHERE report_id=${reportId}`;
    expect(pdfs.length).toBe(1);
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_exportado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("admin_recepcao não gera rascunho (papel)", async () => {
    const r = await gerarRascunhoFamilia(
      ctx("admin_recepcao", RECEP),
      gerarInput,
    );
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("terapeuta fora da equipe não gera (RLS esconde o paciente)", async () => {
    const r = await gerarRascunhoFamilia(
      ctx("terapeuta", TERA_OFF),
      gerarInput,
    );
    expect("error" in r).toBe(true);
  });
});
