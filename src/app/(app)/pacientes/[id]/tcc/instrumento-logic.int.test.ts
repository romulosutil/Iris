import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

// #393 — clínica/paciente DEDICADOS a este arquivo (namespaced pelo nº da
// issue), nunca reutiliza fixture de outro `*.int.test.ts` (memória
// `truncate-extra-colide-com-int-test-paralelo` / `qa-em-branch-errado`).
const CLINIC = "00000000-0000-0000-0000-000000393c01";
const CLINIC_B = "00000000-0000-0000-0000-000000393c02";
const U_COORD = "00000000-0000-0000-0000-000000393a01";
const U_T1 = "00000000-0000-0000-0000-000000393a02"; // na equipe de PAC
const PAC = "00000000-0000-0000-0000-000000393b01";
const PAC_B = "00000000-0000-0000-0000-000000393b02"; // outra clínica

const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let L: typeof import("./instrumento-logic");
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)(
  "TCC · Aplicação de instrumento padronizado (PHQ-9/GAD-7, #393)",
  () => {
    beforeAll(async () => {
      L = await import("./instrumento-logic");
      ({ sql: appSql } = await import("@/db/client"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      // Limpeza ESCOPADA (nunca TRUNCATE): só as linhas deste arquivo.
      // `alerta_risco_clinico` primeiro: referencia `instrumento_aplicacao`
      // via `instrumento_aplicacao_id` (migração 0114), FK quebraria na
      // ordem inversa.
      await owner`DELETE FROM alerta_risco_clinico WHERE patient_id IN (${PAC}, ${PAC_B})`;
      await owner`DELETE FROM instrumento_aplicacao WHERE patient_id IN (${PAC}, ${PAC_B})`;
      await owner`DELETE FROM care_team_membership WHERE patient_id IN (${PAC}, ${PAC_B})`;
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clinic 393'), (${CLINIC_B}, 'Clinic 393-B')
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord393@x.com', 'Coord393'), (${U_T1}, 't1-393@x.com', 'T1-393')
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_T1}, ${CLINIC}, 'terapeuta'),
      (${U_COORD}, ${CLINIC_B}, 'coordenador')
      ON CONFLICT (user_id, clinic_id, papel) DO NOTHING`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC}, 'Paciente 393'), (${PAC_B}, ${CLINIC_B}, 'Paciente 393-B')
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'Psicologia')
      ON CONFLICT DO NOTHING`;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("PHQ-9: escore recalculado no servidor a partir de respostasPorItem (nunca de um total do cliente)", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "terapeuta_calculou_na_sessao",
        respostasPorItem: [
          { item: 1, valor: 2 },
          { item: 2, valor: 1 },
          { item: 3, valor: 0 },
          { item: 9, valor: 1 },
        ],
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const [row] = await owner`
        SELECT escore_total, item_9_valor, item_risco_positivo, respostas_por_item
          FROM instrumento_aplicacao WHERE id = ${res.id!}
      `;
      // 2 + 1 + 0 + 1 = 4 — nunca aceito de um campo "escoreTotal" externo,
      // que nem existe no input aceito por `salvarInstrumentoAplicacao`.
      expect(row!.escore_total).toBe(4);
      expect(row!.item_9_valor).toBe(1);
      expect(row!.item_risco_positivo).toBe(true);
    });

    test("GAD-7: item9Valor sempre null, mesmo se o payload tentar incluir um item 9", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "gad7",
        fonteDoEscore: "nao_informado",
        respostasPorItem: [
          { item: 1, valor: 3 },
          { item: 7, valor: 2 },
          // GAD-7 não tem item 9 clinicamente — mesmo se aparecer no
          // payload, a extração de item9Valor é gateada por tipoInstrumento.
          { item: 9, valor: 3 },
        ],
      });

      expect(res.error).toBeUndefined();
      const [row] = await owner`
        SELECT item_9_valor, item_risco_positivo FROM instrumento_aplicacao
         WHERE id = ${res.id!}
      `;
      expect(row!.item_9_valor).toBeNull();
      expect(row!.item_risco_positivo).toBeNull();
    });

    test("item 9 não respondido: item9Valor e itemRiscoPositivo ficam NULL (nunca false)", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "terapeuta_calculou_na_sessao",
        respostasPorItem: [
          { item: 1, valor: 1 },
          { item: 2, valor: 1 },
          // item 9 ausente de propósito.
        ],
      });

      expect(res.error).toBeUndefined();

      // Checagem explícita `IS NULL` (não `= false`) — distingue "não
      // respondido" de "respondeu 0/negou risco" no nível do banco, não só
      // no TypeScript.
      const [rowIsNull] = await owner`
        SELECT (item_risco_positivo IS NULL) AS eh_null,
               (item_risco_positivo IS NOT DISTINCT FROM false) AS eh_false
          FROM instrumento_aplicacao WHERE id = ${res.id!}
      `;
      expect(rowIsNull!.eh_null).toBe(true);
      expect(rowIsNull!.eh_false).toBe(false);
    });

    test("item 9 respondido com 0: itemRiscoPositivo é false (distinto de null)", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "paciente_informou",
        respostasPorItem: [
          { item: 1, valor: 0 },
          { item: 9, valor: 0 },
        ],
      });

      expect(res.error).toBeUndefined();
      const [row] = await owner`
        SELECT (item_risco_positivo IS NOT DISTINCT FROM false) AS eh_false,
               (item_risco_positivo IS NULL) AS eh_null
          FROM instrumento_aplicacao WHERE id = ${res.id!}
      `;
      expect(row!.eh_false).toBe(true);
      expect(row!.eh_null).toBe(false);
    });

    test("item 9 >= 1: cria alerta ancorado em instrumento_aplicacao_id (não em origem_extraction_id)", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "terapeuta_calculou_na_sessao",
        respostasPorItem: [{ item: 9, valor: 2 }],
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();
      // Gap fix: agora REGISTRA de verdade — não sinaliza mais
      // `alertaRiscoErro` de gap conhecido.
      expect(res.alertaRiscoErro).toBeUndefined();

      const [alerta] = await owner`
        SELECT origem, instrumento_aplicacao_id, origem_extraction_id, severidade, certeza
          FROM alerta_risco_clinico
         WHERE instrumento_aplicacao_id = ${res.id!}
      `;
      expect(alerta).toBeTruthy();
      expect(alerta!.origem).toBe("instrumento_formal");
      expect(alerta!.instrumento_aplicacao_id).toBe(res.id);
      // Âncora ALTERNATIVA (caminho via agente) fica NULL no caminho manual.
      expect(alerta!.origem_extraction_id).toBeNull();
      expect(alerta!.severidade).toBe("ideacao_ativa_sem_plano"); // item9=2
      expect(alerta!.certeza).toBe("explicito");
    });

    test("item 9 = 0: não cria alerta algum", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "terapeuta_calculou_na_sessao",
        respostasPorItem: [{ item: 9, valor: 0 }],
      });

      expect(res.error).toBeUndefined();
      expect(res.alertaRiscoErro).toBeUndefined();

      const alertas = await owner`
        SELECT id FROM alerta_risco_clinico WHERE instrumento_aplicacao_id = ${res.id!}
      `;
      expect(alertas.length).toBe(0);
    });

    test("item 9 não respondido (recusa, PHQ-9): cria alerta com certeza ambiguo_citado, não rebaixa severidade", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "nao_informado",
        respostasPorItem: [{ item: 1, valor: 1 }], // item 9 ausente de propósito
      });

      expect(res.error).toBeUndefined();
      expect(res.alertaRiscoErro).toBeUndefined();

      const [alerta] = await owner`
        SELECT origem, instrumento_aplicacao_id, origem_extraction_id, severidade, certeza
          FROM alerta_risco_clinico
         WHERE instrumento_aplicacao_id = ${res.id!}
      `;
      expect(alerta).toBeTruthy();
      expect(alerta!.origem).toBe("instrumento_formal");
      expect(alerta!.instrumento_aplicacao_id).toBe(res.id);
      expect(alerta!.origem_extraction_id).toBeNull();
      // Recusa nunca rebaixa severidade (§1.4) — fallback preservado.
      expect(alerta!.severidade).toBe("ideacao_ativa_sem_plano");
      expect(alerta!.certeza).toBe("ambiguo_citado");
    });

    test("GAD-7 nunca dispara alerta de instrumento (item 9 não existe nesse instrumento)", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "gad7",
        fonteDoEscore: "nao_informado",
        respostasPorItem: [{ item: 1, valor: 3 }],
      });

      expect(res.error).toBeUndefined();
      expect(res.alertaRiscoErro).toBeUndefined();

      const alertas = await owner`
        SELECT id FROM alerta_risco_clinico WHERE instrumento_aplicacao_id = ${res.id!}
      `;
      expect(alertas.length).toBe(0);
    });

    test("validação rejeita respostasPorItem vazio", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxT1, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "nao_informado",
        respostasPorItem: [],
      });
      expect(res.error).toBeTruthy();
      expect(res.id).toBeUndefined();
    });

    test("isolamento multi-tenant: clínica B não salva instrumento de paciente da clínica A", async () => {
      const res = await L.salvarInstrumentoAplicacao(ctxCoordB, {
        patientId: PAC,
        tipoInstrumento: "phq9",
        fonteDoEscore: "nao_informado",
        respostasPorItem: [{ item: 1, valor: 1 }],
      });
      expect(res.error).toBeTruthy();

      const entriesB = await L.obterInstrumentoAplicacoes(ctxCoordB, PAC);
      expect(entriesB.length).toBe(0);
    });

    test("obterInstrumentoAplicacoes retorna as aplicações do paciente, mais recente primeiro", async () => {
      const entries = await L.obterInstrumentoAplicacoes(ctxCoord, PAC);
      expect(entries.length).toBeGreaterThan(0);
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1]!.criadoEm.getTime()).toBeGreaterThanOrEqual(
          entries[i]!.criadoEm.getTime(),
        );
      }
    });
  },
);
