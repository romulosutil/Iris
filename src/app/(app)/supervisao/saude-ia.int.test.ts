import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

/**
 * DA-01 (#535): view `metricas_extracao_por_clinica_semana` (migração 0144)
 * lida pelo bloco "Saúde da IA" do /supervisao.
 *
 * O que se prova aqui, medindo no banco (não lendo o .sql):
 *  1. o coordenador da clínica A vê a agregação da própria clínica, com as
 *     contagens certas por estado, modelo e prompt;
 *  2. o coordenador da clínica B vê ZERO linhas de A (isolamento reimposto na
 *     própria view, `app_clinic_id_exigido()`);
 *  3. terapeuta da clínica A não lê a view (métrica é da clínica, não das
 *     sessões dele — a view filtra o papel);
 *  4. sem tenant no GUC a view levanta erro nomeado (P0001), não devolve
 *     vazio em silêncio.
 */

const CLINIC_A = "00000000-0000-0000-0000-00000000da01";
const CLINIC_B = "00000000-0000-0000-0000-00000000da02";
const U_COORD_A = "00000000-0000-0000-0000-0000000da0a1";
const U_COORD_B = "00000000-0000-0000-0000-0000000da0b1";
const U_TERA_A = "00000000-0000-0000-0000-0000000da0a2";
const PAC_A = "00000000-0000-0000-0000-000000da0ac1";
const PAC_B = "00000000-0000-0000-0000-000000da0bc1";
const SESS_A = "00000000-0000-0000-0000-00000da05ea1";
const SESS_B = "00000000-0000-0000-0000-00000da05eb1";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD_B,
  role: "coordenador",
} as const;
const ctxTeraA = {
  clinicId: CLINIC_A,
  userId: U_TERA_A,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let listarSaudeIa: typeof import("./queries").listarSaudeIa;

describe.skipIf(!hasDb)("DA-01 · metricas_extracao_por_clinica_semana", () => {
  beforeAll(async () => {
    ({ listarSaudeIa } = await import("./queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // Limpeza ESCOPADA (memória: TRUNCATE extra colide com int-test paralelo).
    await owner`DELETE FROM extraction WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM session WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_COORD_B}, ${U_TERA_A})`;
    await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;

    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'DA01 A'), (${CLINIC_B}, 'DA01 B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD_A}, 'da01.coord.a@x.test', 'Coord A'),
      (${U_COORD_B}, 'da01.coord.b@x.test', 'Coord B'),
      (${U_TERA_A}, 'da01.tera.a@x.test', 'Tera A')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador'),
      (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A}, ${CLINIC_A}, 'PA'), (${PAC_B}, ${CLINIC_B}, 'PB')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS_A}, ${CLINIC_A}, ${PAC_A}, ${U_TERA_A}, now(), 'realizada', 'aba'),
      (${SESS_B}, ${CLINIC_B}, ${PAC_B}, ${U_COORD_B}, now(), 'realizada', 'aba')`;

    // Clínica A, semana corrente, modelo m1/prompt p1:
    //   2 aprovadas sem edição, 1 editada, 1 descartada, 1 sugerida (=5
    //   sugeridas), 1 pendente (chamada que falhou: latência sem tokens).
    const linha = (
      estado: string,
      revisada: boolean,
      latencia: number | null,
      tokens: [number, number] | null,
    ) => owner`
      INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte,
        confianca, payload, criado_em, revisado_em, revisado_por,
        modelo, prompt_versao, latencia_ms, tokens_entrada, tokens_saida)
      VALUES (${SESS_A}, ${CLINIC_A}, ${estado}::extraction_estado,
        ${estado === "pendente_reprocessamento" ? "pendente" : "evidencia"}::extraction_subtipo,
        'trecho', 'alta', '{}'::jsonb,
        now() - interval '2 hours',
        ${revisada ? owner`now() - interval '1 hour'` : null},
        ${revisada ? U_COORD_A : null},
        'm1', ${estado === "pendente_reprocessamento" ? null : "p1"},
        ${latencia}, ${tokens ? tokens[0] : null}, ${tokens ? tokens[1] : null})`;
    await linha("aprovada", true, 1000, [100, 10]);
    await linha("aprovada", true, 3000, [100, 10]);
    await linha("editada", true, 2000, [100, 10]);
    await linha("descartada", true, 4000, [100, 10]);
    await linha("sugerida", false, 5000, [100, 10]);
    await linha("pendente_reprocessamento", false, 92000, null);
    // Clínica B: uma sugestão com outro modelo — nunca aparece para A.
    await owner`
      INSERT INTO extraction (session_id, clinic_id, estado, subtipo, trecho_fonte,
        confianca, payload, modelo, prompt_versao, latencia_ms)
      VALUES (${SESS_B}, ${CLINIC_B}, 'sugerida', 'evidencia', 'x', 'alta', '{}'::jsonb,
        'm-b', 'p-b', 10)`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("coordenador da clínica A lê a agregação da semana: contagens, medianas, tokens", async () => {
    const linhas = await listarSaudeIa(ctxCoordA);
    // dois grupos: m1/p1 (as 5 sugestões) e m1/NULL (a chamada que falhou,
    // sem prompt porque não houve resposta)
    expect(linhas).toHaveLength(2);
    const p1 = linhas.find((l) => l.promptVersao === "p1")!;
    expect(p1).toBeDefined();
    expect(p1.modelo).toBe("m1");
    expect(p1.semanaIso).toMatch(/^\d{4}-W\d{2}$/);
    expect(p1.totalSugeridas).toBe(5);
    expect(p1.aprovadasSemEdicao).toBe(2);
    expect(p1.editadas).toBe(1);
    expect(p1.descartadas).toBe(1);
    expect(p1.pendentes).toBe(0);
    // todas revisadas 1 h depois de criadas
    expect(p1.medianaSegundosAteRevisao).toBeCloseTo(3600, 0);
    // latências 1000..5000 → mediana 3000
    expect(p1.medianaLatenciaMs).toBe(3000);
    expect(p1.tokensEntrada).toBe(500);
    expect(p1.tokensSaida).toBe(50);

    const falha = linhas.find((l) => l.promptVersao === null)!;
    expect(falha).toBeDefined();
    expect(falha.modelo).toBe("m1");
    expect(falha.totalSugeridas).toBe(0);
    expect(falha.pendentes).toBe(1);
    expect(falha.medianaLatenciaMs).toBe(92000);
    expect(falha.medianaSegundosAteRevisao).toBeNull();
    expect(falha.tokensEntrada).toBeNull();
  });

  test("a view não expõe coluna clínica/PII: só agregados, semana, modelo e prompt", async () => {
    const colunas = await owner`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'metricas_extracao_por_clinica_semana'
      ORDER BY ordinal_position`;
    const nomes = colunas.map((c) => c.column_name as string);
    for (const proibida of [
      "session_id",
      "patient_id",
      "trecho_fonte",
      "payload",
      "payload_editado",
      "revisado_por",
    ]) {
      expect(nomes).not.toContain(proibida);
    }
    expect(nomes).toContain("aprovadas_sem_edicao");
  });

  test("coordenador da clínica B vê só a própria clínica — zero linhas de A", async () => {
    const linhas = await listarSaudeIa(ctxCoordB);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.modelo).toBe("m-b");
    expect(linhas.some((l) => l.modelo === "m1")).toBe(false);
  });

  test("terapeuta da clínica A não lê a view (métrica é da clínica, papel filtrado na view)", async () => {
    const linhas = await listarSaudeIa(ctxTeraA);
    expect(linhas).toHaveLength(0);
  });

  test("sem tenant no GUC a view levanta erro nomeado, não vazio em silêncio", async () => {
    await expect(
      appSql`SELECT * FROM metricas_extracao_por_clinica_semana`,
    ).rejects.toMatchObject({ code: "P0001" });
  });
});
