import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

// #393 T5 — prova end-to-end (via `app_criar_alerta_risco`) de que
// `registrarAlertaRiscoInstrumento` grava a severidade mapeada de
// `item9Valor`, não a severidade fixa do chamador.

const CLINIC_A = "00000000-0000-0000-0000-0000000000b1";
const U_T1 = "00000000-0000-0000-0000-0000000071b1";
const U_COORD = "00000000-0000-0000-0000-0000000072b1";
const PAC = "00000000-0000-0000-0000-00000000acb1";
const SESS = "00000000-0000-0000-0000-00000005e1b1";
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let registrarAlertaRiscoInstrumento: typeof import("./registrar").registrarAlertaRiscoInstrumento;

const criarExtracao = async (trechoFonte: string) => {
  const rows = await owner`
    INSERT INTO extraction (session_id, clinic_id, subtipo, trecho_fonte, confianca, payload)
    VALUES (${SESS}, ${CLINIC_A}, 'aplicacao_escala_relatada', ${trechoFonte}, 'alta', '{"item_risco_positivo": true}'::jsonb)
    RETURNING id
  `;
  return rows[0]!.id as string;
};

const sinalBase = {
  categoria: "ideacao_suicida" as const,
  certeza: "explicito" as const,
  detalhe: "Item 9 do PHQ-9 respondido, #393.",
};

describe.skipIf(!hasDb)(
  "registrarAlertaRiscoInstrumento · item9Valor -> severidade (#393)",
  () => {
    beforeAll(async () => {
      ({ registrarAlertaRiscoInstrumento } = await import("./registrar"));
      ({ sql: appSql } = await import("@/db/client"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, alerta_risco_clinico RESTART IDENTITY CASCADE`;
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'B')`;
      await owner`INSERT INTO app_user (id, email, name) VALUES
        (${U_T1}, 't1b@x.com', 'T1'), (${U_COORD}, 'coordb@x.com', 'Coord')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
        (${U_T1}, ${CLINIC_A}, 'terapeuta'), (${U_COORD}, ${CLINIC_A}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC_A}, 'P')`;
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
        (${SESS}, ${CLINIC_A}, ${PAC}, ${U_T1}, now(), 'realizada', 'tcc')`;
    });
    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("item9Valor=1 grava severidade ideacao_passiva", async () => {
      const extractionId = await criarExtracao("Sentiu vontade de sumir, sem elaborar. Item 9=1.");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: { ...sinalBase, severidade: "ideacao_ativa_sem_plano", trecho_fonte: "Item 9 = 1" },
        item9Valor: 1,
      });
      expect(r).toHaveProperty("alertaId");
      const rows =
        await owner`SELECT severidade FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows[0]!.severidade).toBe("ideacao_passiva");
    });

    test("item9Valor=2 grava ideacao_ativa_sem_plano, nunca com_plano", async () => {
      const extractionId = await criarExtracao("Item 9=2, vários dias da semana.");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: { ...sinalBase, severidade: "ideacao_ativa_sem_plano", trecho_fonte: "Item 9 = 2" },
        item9Valor: 2,
      });
      expect(r).toHaveProperty("alertaId");
      const rows =
        await owner`SELECT severidade FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows[0]!.severidade).toBe("ideacao_ativa_sem_plano");
    });

    test("item9Valor=3 (frequência máxima) ainda grava ideacao_ativa_sem_plano, nunca com_plano", async () => {
      const extractionId = await criarExtracao("Item 9=3, quase todos os dias.");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: { ...sinalBase, severidade: "ideacao_ativa_sem_plano", trecho_fonte: "Item 9 = 3" },
        item9Valor: 3,
      });
      expect(r).toHaveProperty("alertaId");
      const rows =
        await owner`SELECT severidade FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows[0]!.severidade).toBe("ideacao_ativa_sem_plano");
      expect(rows[0]!.severidade).not.toBe("ideacao_ativa_com_plano");
    });

    test("item9Valor=0 não cria alerta algum (no-op)", async () => {
      const extractionId = await criarExtracao("Item 9=0, sem sinal.");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: { ...sinalBase, severidade: "ideacao_ativa_sem_plano", trecho_fonte: "Item 9 = 0" },
        item9Valor: 0,
      });
      expect(r).toEqual({ naoDisparado: true });
      const rows =
        await owner`SELECT id FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows.length).toBe(0);
    });

    test("item9Valor=null (recusa) preserva a severidade fallback do chamador, não rebaixa", async () => {
      const extractionId = await criarExtracao("Paciente recusou responder o item 9.");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: {
          ...sinalBase,
          certeza: "ambiguo_citado",
          severidade: "ideacao_ativa_sem_plano",
          trecho_fonte: "Item 9 recusado",
        },
        item9Valor: null,
      });
      expect(r).toHaveProperty("alertaId");
      const rows =
        await owner`SELECT severidade, certeza FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows[0]!.severidade).toBe("ideacao_ativa_sem_plano");
      expect(rows[0]!.certeza).toBe("ambiguo_citado");
    });

    test("item9Valor omitido (chamador antigo, Fase E de #391) preserva comportamento — severidade do chamador intacta", async () => {
      const extractionId = await criarExtracao("Chamador sem granularidade de item 9 (Fase E).");
      const r = await registrarAlertaRiscoInstrumento(ctxT1, {
        patientId: PAC,
        sessionId: SESS,
        extractionId,
        sinal: {
          ...sinalBase,
          severidade: "ideacao_ativa_sem_plano",
          trecho_fonte: "Sem item9Valor",
        },
        // item9Valor OMITIDO de propósito — assinatura antiga
      });
      expect(r).toHaveProperty("alertaId");
      const rows =
        await owner`SELECT severidade FROM alerta_risco_clinico WHERE origem_extraction_id = ${extractionId}`;
      expect(rows[0]!.severidade).toBe("ideacao_ativa_sem_plano");
    });
  },
);
