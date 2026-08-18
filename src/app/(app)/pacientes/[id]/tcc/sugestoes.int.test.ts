import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

// #392 — ponte agente → RPD sugerido. IDs DEDICADOS a este arquivo (nunca
// reaproveita CLINIC_A/CLINIC_B genéricos de `logic.int.test.ts`, que roda no
// mesmo diretório — memória `truncate-extra-colide-com-int-test-paralelo`:
// fixture compartilhada mutada por dois arquivos em paralelo é a mesma classe
// de risco de colisão que TRUNCATE indevido).
const CLINIC_A = "00000000-0000-0000-0000-000000392aaa";
const CLINIC_B = "00000000-0000-0000-0000-000000392bbb";
const U_COORD = "00000000-0000-0000-0000-0000003920c1";
const U_T1 = "00000000-0000-0000-0000-0000003920d1"; // dono da SESS_A
const U_COORD_B = "00000000-0000-0000-0000-0000003920c2";
const PAC_A = "00000000-0000-0000-0000-0000003920e1";
const PAC_B = "00000000-0000-0000-0000-0000003920e2";
const SESS_A = "00000000-0000-0000-0000-0000003920f1";
const SESS_B = "00000000-0000-0000-0000-0000003920f2";

const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let S: typeof import("./sugestoes");
let R: typeof import("@/lib/risco/registrar");
let appSql: typeof import("@/db/client").sql;

async function limparEstadoMutavel() {
  // Só as linhas MUTÁVEIS por teste (extraction/tcc_rpd_entry/alerta) são
  // apagadas entre casos — clinic/app_user/patient/session ficam de pé
  // (fixture estável, reinserida com ON CONFLICT DO NOTHING no beforeAll).
  await owner`DELETE FROM alerta_risco_clinico WHERE patient_id IN (${PAC_A}, ${PAC_B})`;
  await owner`DELETE FROM tcc_rpd_entry WHERE patient_id IN (${PAC_A}, ${PAC_B})`;
  await owner`DELETE FROM extraction WHERE session_id IN (${SESS_A}, ${SESS_B})`;
}

describe.skipIf(!hasDb)("TCC · fila de RPD sugerido (#392)", () => {
  beforeAll(async () => {
    S = await import("./sugestoes");
    R = await import("@/lib/risco/registrar");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await limparEstadoMutavel();

    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, '392-A'), (${CLINIC_B}, '392-B')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, '392coord@x.com', 'Coord A'),
      (${U_T1}, '392t1@x.com', 'T1'),
      (${U_COORD_B}, '392coordb@x.com', 'Coord B')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')
      ON CONFLICT (user_id, clinic_id, papel) DO NOTHING`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A}, ${CLINIC_A}, '392 Paciente A'),
      (${PAC_B}, ${CLINIC_B}, '392 Paciente B')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS_A}, ${CLINIC_A}, ${PAC_A}, ${U_T1}, now(), 'realizada', 'Psicologia'),
      (${SESS_B}, ${CLINIC_B}, ${PAC_B}, ${U_COORD_B}, now(), 'realizada', 'Psicologia')
      ON CONFLICT (id) DO NOTHING`;
    // `tcc_rpd_entry_insert` (0103) exige coordenador OU membro da equipe do
    // paciente — T1 precisa estar na equipe de PAC_A para que
    // `aprovarRPDSugestao` (que insere como terapeuta) passe pelo RLS.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC_A}, ${U_T1}, 'terapeuta_referencia', 'Psicologia')
      ON CONFLICT DO NOTHING`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  beforeEach(limparEstadoMutavel);

  test("obterRPDSugestoes retorna só sugerida/registro_pensamento do paciente, isolado por clínica", async () => {
    const EX_OK = "00000000-0000-0000-0000-000000392101";
    const EX_APROVADA = "00000000-0000-0000-0000-000000392102";
    const EX_OUTRO_SUBTIPO = "00000000-0000-0000-0000-000000392103";
    const EX_B = "00000000-0000-0000-0000-000000392104";

    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX_OK}, ${SESS_A}, ${CLINIC_A}, 'sugerida', 'registro_pensamento', 'trecho ok', 'alta', '{}'),
      (${EX_APROVADA}, ${SESS_A}, ${CLINIC_A}, 'aprovada', 'registro_pensamento', 'trecho aprovado', 'alta', '{}'),
      (${EX_OUTRO_SUBTIPO}, ${SESS_A}, ${CLINIC_A}, 'sugerida', 'evidencia', 'trecho evidencia', 'alta', '{}'),
      (${EX_B}, ${SESS_B}, ${CLINIC_B}, 'sugerida', 'registro_pensamento', 'trecho B', 'alta', '{}')`;

    const sugestoes = await S.obterRPDSugestoes(ctxT1, PAC_A);
    expect(sugestoes.map((s) => s.extractionId)).toEqual([EX_OK]);

    // Cross-tenant: clínica B pedindo a fila do paciente A não enxerga nada
    // (RLS `extraction_select` — 0085:177 — isola por clinic_id + sessão
    // visível, mesma leitura que a fila reusa sem re-derivar).
    const sugestoesCrossTenant = await S.obterRPDSugestoes(ctxCoordB, PAC_A);
    expect(sugestoesCrossTenant).toEqual([]);
  });

  test("aprovarRPDSugestao grava proveniência, transiciona extração, não recria alerta já ancorado", async () => {
    const EX = "00000000-0000-0000-0000-000000392105";
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX}, ${SESS_A}, ${CLINIC_A}, 'sugerida', 'registro_pensamento', 'trecho aprovar', 'alta', '{}')`;

    // Simula o alerta da Fase F (`registrarAlertaRiscoRPDSugerido`,
    // `diario/[sessionId]/logic.ts`) — já existe ANTES da aprovação,
    // ancorado só na extração (sem rpd_entry_id).
    const alertaFaseF = await R.registrarAlertaRiscoRPDSugerido(ctxT1, {
      patientId: PAC_A,
      extractionId: EX,
      sinal: {
        categoria: "ideacao_suicida",
        severidade: "ideacao_ativa_sem_plano",
        certeza: "ambiguo_citado",
        trecho_fonte: "trecho da sugestão",
        detalhe: "detalhe da Fase F",
      },
    });
    expect("alertaId" in alertaFaseF).toBe(true);
    const alertaId = (alertaFaseF as { alertaId: string }).alertaId;

    const res = await S.aprovarRPDSugestao(ctxT1, {
      extractionId: EX,
      patientId: PAC_A,
      situacao: "Situação confirmada",
      pensamentoAutomatico: "Pensamento confirmado pelo terapeuta",
      emocao: "Ansiedade",
      intensidade: 60,
    });

    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();

    const [entry] = await owner`
      SELECT patient_id, origem_extraction_id, origem_agente
        FROM tcc_rpd_entry WHERE id = ${res.id!}
    `;
    expect(entry!.patient_id).toBe(PAC_A);
    expect(entry!.origem_extraction_id).toBe(EX);
    expect(entry!.origem_agente).toBe(true);

    const [extracao] = await owner`
      SELECT estado FROM extraction WHERE id = ${EX}
    `;
    expect(extracao!.estado).toBe("aprovada");

    // O alerta da Fase F não foi migrado nem recriado: mesmo id, ainda
    // ancorado na extração, `rpd_entry_id` continua NULL.
    const [alertaDepois] = await owner`
      SELECT id, rpd_entry_id, origem_extraction_id
        FROM alerta_risco_clinico WHERE id = ${alertaId}
    `;
    expect(alertaDepois!.id).toBe(alertaId);
    expect(alertaDepois!.rpd_entry_id).toBeNull();
    expect(alertaDepois!.origem_extraction_id).toBe(EX);

    const [contagemAlertas] = await owner`
      SELECT count(*)::int AS n FROM alerta_risco_clinico WHERE patient_id = ${PAC_A}
    `;
    expect(contagemAlertas!.n).toBe(1);
  });

  test("aprovação concorrente (2ª chamada após sucesso) recebe erro de concorrência, sem duplicar linha", async () => {
    const EX = "00000000-0000-0000-0000-000000392106";
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX}, ${SESS_A}, ${CLINIC_A}, 'sugerida', 'registro_pensamento', 'trecho duplo', 'alta', '{}')`;

    const input = {
      extractionId: EX,
      patientId: PAC_A,
      situacao: "Situação",
      pensamentoAutomatico: "Pensamento",
      emocao: "Raiva",
      intensidade: 50,
    };

    const primeira = await S.aprovarRPDSugestao(ctxT1, input);
    expect(primeira.error).toBeUndefined();
    expect(primeira.id).toBeTruthy();

    const segunda = await S.aprovarRPDSugestao(ctxT1, input);
    expect(segunda.error).toBe("CONCURRENCY_ERROR");
    expect(segunda.id).toBeUndefined();

    const [contagem] = await owner`
      SELECT count(*)::int AS n FROM tcc_rpd_entry WHERE origem_extraction_id = ${EX}
    `;
    expect(contagem!.n).toBe(1);
  });

  test("descartarRPDSugestao transiciona para descartada, não apaga extração nem alerta pré-existente", async () => {
    const EX = "00000000-0000-0000-0000-000000392107";
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX}, ${SESS_A}, ${CLINIC_A}, 'sugerida', 'registro_pensamento', 'trecho descartar', 'alta', '{}')`;

    const alerta = await R.registrarAlertaRiscoRPDSugerido(ctxT1, {
      patientId: PAC_A,
      extractionId: EX,
      sinal: {
        categoria: "autolesao",
        severidade: "autolesao_recente",
        certeza: "ambiguo_citado",
        trecho_fonte: "trecho do descarte",
        detalhe: "detalhe",
      },
    });
    expect("alertaId" in alerta).toBe(true);

    const res = await S.descartarRPDSugestao(ctxT1, { extractionId: EX });
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);

    const [extracao] = await owner`
      SELECT estado, trecho_fonte FROM extraction WHERE id = ${EX}
    `;
    expect(extracao!.estado).toBe("descartada");
    expect(extracao!.trecho_fonte).toBe("trecho descartar");

    const [contagemAlerta] = await owner`
      SELECT count(*)::int AS n FROM alerta_risco_clinico WHERE origem_extraction_id = ${EX}
    `;
    expect(contagemAlerta!.n).toBe(1);

    // Descarte após descarte (double-discard): não é aceito de novo.
    const resDuplo = await S.descartarRPDSugestao(ctxT1, {
      extractionId: EX,
    });
    expect(resDuplo.error).toBeTruthy();
  });
});
