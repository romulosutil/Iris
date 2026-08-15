import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";
import { RoleError } from "@/auth/require-role";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC
const U_T2 = "00000000-0000-0000-0000-0000000072a1"; // NÃO na equipe de PAC
const U_RECEP = "00000000-0000-0000-0000-0000000073a1"; // admin_recepcao, sem acesso clínico
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_B = "00000000-0000-0000-0000-0000000ac1b1"; // outra clínica

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
const ctxRecep = {
  clinicId: CLINIC_A,
  userId: U_RECEP,
  role: "admin_recepcao",
} as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let L: typeof import("./logic");
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)("TCC · Registro de Pensamentos Distorcidos (RPD)", () => {
  beforeAll(async () => {
    L = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    // TRUNCATE ... CASCADE (não DELETE escopado): PAC/CLINIC_A são o mesmo
    // UUID literal reusado por várias outras suítes .int.test.ts (diario,
    // protocolos, metas, arquivamento, desarquivamento) como "paciente
    // canônico" de fixture. Suítes anteriores na ordem de execução (ex.:
    // diario/actions.int.test.ts, que roda antes por ordem alfabética)
    // deixam linhas residuais em tabelas-filhas de patient (ex.: session)
    // que um DELETE escopado só a tcc_rpd_entry/care_team_membership/patient
    // não limpa, estourando FK. `fileParallelism: false` no
    // vitest.integration.config.ts ("uma conexão/DB por vez") é o que torna
    // TRUNCATE seguro aqui — arquivos rodam em série, não em paralelo, então
    // a colisão que a memória "TRUNCATE extra colide com int-test paralelo"
    // descreve (deadlock entre arquivos concorrentes) não se aplica a esta
    // config. CASCADE cobre session/extraction/goal/etc. sem enumerar cada
    // tabela-filha à mão.
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, tcc_rpd_entry RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2'),
      (${U_RECEP}, 'recep@x.com', 'Recep')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_RECEP}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_COORD}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'Paciente A'), (${PAC_B}, ${CLINIC_B}, 'Paciente B')`;
    // T1 está na equipe de PAC; T2 não.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'Psicologia')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta da equipe salva RPD com sucesso e obtém entradas", async () => {
    const res = await L.salvarRPD(ctxT1, {
      patientId: PAC,
      situacao: "Reunião de trabalho",
      pensamentoAutomatico: "Vou cometer um erro grave e ser demitido",
      emocao: "Ansiedade",
      intensidade: 85,
      distorcaoCognitiva: "Catastrofização",
      respostaRacional: "Mesmo que eu erre algo, posso corrigir. Tenho bom histórico profissional.",
      intensidadePos: 35,
    });

    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();

    const entries = await L.obterRPDEntries(ctxT1, PAC);
    expect(entries.length).toBeGreaterThan(0);
    const item = entries.find((e) => e.id === res.id);
    expect(item).toBeTruthy();
    expect(item?.situacao).toBe("Reunião de trabalho");
    expect(item?.intensidade).toBe(85);
    expect(item?.intensidadePos).toBe(35);
  });

  test("validação rejeita intensidade fora da faixa 0-100%", async () => {
    const resInvalido = await L.salvarRPD(ctxT1, {
      patientId: PAC,
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: 150, // Inválido
      distorcaoCognitiva: "Leitura Mental",
      respostaRacional: "Resposta",
    });

    expect(resInvalido.error).toBe("Intensidade deve ser no máximo 100");
    expect(resInvalido.id).toBeUndefined();
  });

  test("terapeuta FORA da equipe é barrado ao tentar salvar RPD", async () => {
    const res = await L.salvarRPD(ctxT2, {
      patientId: PAC,
      situacao: "Apresentação",
      pensamentoAutomatico: "Ninguém vai gostar",
      emocao: "Vergonha",
      intensidade: 70,
      distorcaoCognitiva: "Adivinhação do Futuro",
      respostaRacional: "Não posso prever a reação de todos.",
    });

    // RLS bloqueia silenciosamente (0 linhas afetadas), não lança — o motivo
    // real é a policy, não um erro de validação. Ver logic.ts/withTenant.
    expect(res.error).toBe("Não foi possível salvar o RPD.");
    expect(res.id).toBeUndefined();
  });

  test("terapeuta FORA da equipe não lê RPD do paciente (RLS filtra em silêncio)", async () => {
    // Entradas de PAC já existem (criadas por T1 no teste anterior).
    // app_is_on_team(PAC) é falso para T2 e T2 não é coordenador — a policy
    // de SELECT devolve 0 linhas, sem lançar.
    const entries = await L.obterRPDEntries(ctxT2, PAC);
    expect(entries).toEqual([]);
  });

  test("admin_recepcao é barrado na camada de aplicação antes de tocar o banco", async () => {
    await expect(L.obterRPDEntries(ctxRecep, PAC)).rejects.toThrow(RoleError);
  });

  test("isolamento multi-tenant: clínica B não enxerga nem salva RPD de paciente da clínica A", async () => {
    // Tenta salvar RPD para paciente da clínica A usando contexto da clínica B
    const resSalvar = await L.salvarRPD(ctxCoordB, {
      patientId: PAC,
      situacao: "Invasão cross-tenant",
      pensamentoAutomatico: "Cross-tenant",
      emocao: "Raiva",
      intensidade: 90,
      distorcaoCognitiva: "Personalização",
      respostaRacional: "Invasão bloqueada",
    });

    expect(resSalvar.error).toBe("Não foi possível salvar o RPD.");
    expect(resSalvar.id).toBeUndefined();

    // Consulta do coordenador B não retorna dados do paciente A
    const entriesB = await L.obterRPDEntries(ctxCoordB, PAC);
    expect(entriesB.length).toBe(0);
  });

  test("desarquiva automaticamente paciente arquivado ao registrar RPD", async () => {
    await owner`UPDATE patient SET arquivado_em = now() WHERE id = ${PAC}`;

    const res = await L.salvarRPD(ctxCoord, {
      patientId: PAC,
      situacao: "Situação pós-arquivamento",
      pensamentoAutomatico: "Pensamento",
      emocao: "Tristeza",
      intensidade: 60,
      distorcaoCognitiva: "Filtro Mental",
      respostaRacional: "Resposta",
    });

    expect(res.error).toBeUndefined();

    const [paciente] = await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
    expect(paciente!.arquivado_em).toBeNull();
  });
});
