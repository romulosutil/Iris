import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { StubPdfRenderer } from "@/lib/report/renderer";
import type { TenantContext } from "@/db/rls";
import type {
  CabecalhoConvenio,
  ConvenioNarrativoDraft,
} from "@/lib/report/convenio-narrativo/types";

vi.mock("server-only", () => ({}));
const {
  gerarRascunhoConvenioNarrativo,
  curarConvenioNarrativo,
  exportarConvenioNarrativo,
} = await import("./convenio-narrativo-logic");

const hasDb = !!process.env.MIGRATION_DATABASE_URL;
const owner = hasDb ? postgres(process.env.MIGRATION_DATABASE_URL!) : (null as never);
const CLINIC = "11111111-1111-1111-1111-111111111111";
const COORD = "22222222-2222-2222-2222-222222222222";
const TERA_ON = "33333333-3333-3333-3333-333333333333";
const PAC = "44444444-4444-4444-4444-444444444444";
const ctx = (role: TenantContext["role"], userId: string): TenantContext => ({
  role,
  userId,
  clinicId: CLINIC,
});

const cabecalho: CabecalhoConvenio = {
  operadora: "Amil",
  cid: "F84.0",
  finalidade: "Renovação de guia",
};

const gerarInput = {
  patientId: PAC,
  periodoInicio: "2026-06-01",
  periodoFim: "2026-06-30",
  cabecalho,
};

const draftOk: ConvenioNarrativoDraft = {
  resumoClinico: "Miguel evoluiu bem no período.",
  evolucaoPorDominio: [{ dominio: "Comunicação", narrativa: "Avançou em pedidos." }],
  justificativaContinuidade: "Necessita continuidade do plano terapêutico.",
  objetivosProximoPeriodo: ["Ampliar vocabulário funcional"],
  periodoSemAvancoVisivel: false,
  notaHonestidade: null,
  status: "rascunho_para_revisao",
};

let reportId = "";

describe.skipIf(!hasDb)("Relatório Narrativo de Convênio — máquina de curadoria", () => {
  beforeAll(async () => {
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, goal, report, report_pdf, audit_log RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${COORD},'Coord','c@a.test'),(${TERA_ON},'Ana','a@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${COORD},${CLINIC},'coordenador'),(${TERA_ON},${CLINIC},'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Miguel')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES (${PAC}, ${TERA_ON}, 'ABA', 'terapeuta_referencia')`;
  });
  afterAll(async () => {
    if (hasDb) await owner.end();
  });

  test("terapeuta não pode gerar (papel — convênio é coordenador-only)", async () => {
    const r = await gerarRascunhoConvenioNarrativo(ctx("terapeuta", TERA_ON), gerarInput);
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("coordenador gera rascunho IA (status rascunho, gerado_por_ia, curado null, dossie embutido)", async () => {
    const r = await gerarRascunhoConvenioNarrativo(ctx("coordenador", COORD), gerarInput);
    expect("reportId" in r).toBe(true);
    reportId = (r as { reportId: string }).reportId;
    const [rep] =
      await owner`SELECT status, tipo, gerado_por_ia, payload_versao, payload FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("rascunho");
    expect(rep?.tipo).toBe("convenio_narrativo");
    expect(rep?.gerado_por_ia).toBe(true);
    expect(rep?.payload_versao).toBe(1);
    expect(rep?.payload.curado).toBeNull();
    expect(rep?.payload.cabecalho.operadora).toBe("Amil");
    expect(rep?.payload.dossie).toBeTruthy();
    expect(rep?.payload.dossie.paciente.nome).toBe("Miguel");
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_rascunho_gerado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("exportar antes de curar é bloqueado", async () => {
    const r = await exportarConvenioNarrativo(
      ctx("coordenador", COORD),
      { reportId },
      new StubPdfRenderer(),
    );
    expect(r).toEqual({ error: expect.stringContaining("revisado") });
  });

  test("terapeuta não pode curar (papel)", async () => {
    const r = await curarConvenioNarrativo(ctx("terapeuta", TERA_ON), {
      reportId,
      versaoEsperada: 1,
      cabecalhoEditado: cabecalho,
      draftEditado: draftOk,
    });
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("coordenador cura: status revisado, versao++, revisado_por, cabeçalho editado persistido", async () => {
    const cabecalhoEditado: CabecalhoConvenio = { ...cabecalho, operadora: "Bradesco Saúde" };
    const r = await curarConvenioNarrativo(ctx("coordenador", COORD), {
      reportId,
      versaoEsperada: 1,
      cabecalhoEditado,
      draftEditado: draftOk,
    });
    expect(r).toEqual({ ok: true });
    const [rep] =
      await owner`SELECT status, payload_versao, revisado_por, payload FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("revisado");
    expect(rep?.payload_versao).toBe(2);
    expect(rep?.revisado_por).toBe(COORD);
    expect(rep?.payload.curado.resumoClinico).toContain("Miguel");
    expect(rep?.payload.cabecalho.operadora).toBe("Bradesco Saúde");
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_revisado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("curar com versão obsoleta falha (trava otimista)", async () => {
    const r = await curarConvenioNarrativo(ctx("coordenador", COORD), {
      reportId,
      versaoEsperada: 1,
      cabecalhoEditado: cabecalho,
      draftEditado: draftOk,
    });
    expect("error" in r).toBe(true);
  });

  test("terapeuta não pode exportar (papel)", async () => {
    const r = await exportarConvenioNarrativo(
      ctx("terapeuta", TERA_ON),
      { reportId },
      new StubPdfRenderer(),
    );
    expect(r).toEqual({ error: expect.stringContaining("papel") });
  });

  test("coordenador exporta após revisão: exportado + pdf + audit", async () => {
    const r = await exportarConvenioNarrativo(
      ctx("coordenador", COORD),
      { reportId },
      new StubPdfRenderer(),
    );
    expect("hash" in r).toBe(true);
    const [rep] = await owner`SELECT status FROM report WHERE id=${reportId}`;
    expect(rep?.status).toBe("exportado");
    const pdfs = await owner`SELECT 1 FROM report_pdf WHERE report_id=${reportId}`;
    expect(pdfs.length).toBe(1);
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE acao='relatorio_exportado' AND entidade_id=${reportId}`;
    expect(log).toBeTruthy();
  });

  test("exportar de novo após exportado falha (double export)", async () => {
    const r = await exportarConvenioNarrativo(
      ctx("coordenador", COORD),
      { reportId },
      new StubPdfRenderer(),
    );
    expect("error" in r).toBe(true);
  });
});
