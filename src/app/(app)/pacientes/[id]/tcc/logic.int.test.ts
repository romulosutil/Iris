import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC
const U_T2 = "00000000-0000-0000-0000-0000000072a1"; // NÃO na equipe de PAC
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_B = "00000000-0000-0000-0000-0000000ac1b1"; // outra clínica

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
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
    // Limpeza ESCOPADA (nunca `TRUNCATE ... CASCADE`): as tabelas de base
    // (`clinic`, `app_user`, `patient`) são compartilhadas com outros arquivos
    // de integração que rodam contra o mesmo Postgres. Truncar aqui derruba a
    // fixture do vizinho — na prática dá deadlock e violação de FK em arquivos
    // que nada têm a ver com TCC. Apagamos só as linhas DESTE arquivo, na ordem
    // das FKs, e reinserimos com `ON CONFLICT DO NOTHING` para o caso de a
    // fixture já existir de uma execução anterior (reexecutabilidade).
    // Só as linhas que ESTE arquivo escreve são apagadas. `patient`, `clinic` e
    // `app_user` ficam de pé e são reinseridos com `ON CONFLICT DO NOTHING`:
    // apagar paciente esbarra na FK de `audit_log` (a trilha de auditoria da
    // 1ª execução aponta para ele) e derrubaria o teste na 2ª rodada.
    await owner`DELETE FROM tcc_rpd_entry WHERE patient_id IN (${PAC}, ${PAC_B})`;
    await owner`DELETE FROM care_team_membership WHERE patient_id IN (${PAC}, ${PAC_B})`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2')
      ON CONFLICT (id) DO NOTHING`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD}, ${CLINIC_B}, 'coordenador')
      ON CONFLICT (user_id, clinic_id, papel) DO NOTHING`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'Paciente A'), (${PAC_B}, ${CLINIC_B}, 'Paciente B')
      ON CONFLICT (id) DO NOTHING`;
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

    expect(resInvalido.error).toBeTruthy();
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

    expect(res.error).toBeTruthy();
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

    expect(resSalvar.error).toBeTruthy();

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
