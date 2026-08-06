/**
 * #203 · Fatia 2 — DDL da migração 0077 (o lado do TETO vira append-only).
 *
 * A fatia 1 fechou o lado do consumo. Aqui provamos, contra Postgres real, as
 * três coisas que a 0077 promete e que o diff não demonstra:
 *
 *   1. `patient_alvo_unico_vigente` — UNIQUE e PARCIAL. Sem ele, duas
 *      prescrições vigentes da mesma disciplina coexistem e o teto da barra de
 *      cobertura passa a depender de qual linha a query pegar.
 *   2. `app_role` NÃO consegue reescrever `horas_alvo_semana` (SCD2: represcrever
 *      é fechar vigência e abrir linha nova, nunca UPDATE no lugar), mas
 *      CONSEGUE escrever `vigencia_fim`.
 *   3. `app_role` NÃO consegue apagar prescrição — nem por privilégio, nem por
 *      policy.
 *
 * Privilégio é medido com `has_column_privilege`/`has_table_privilege`, nunca
 * inferido de `role_table_grants` (que esconde grant de coluna).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC = "00000000-0000-0000-0000-0000000203c2";
const PATIENT = "00000000-0000-0000-0000-0000000203b2";

function prescrever(opts: {
  disciplina: string;
  horas: number;
  inicio?: string;
  fim?: string | null;
}) {
  return owner!`
    INSERT INTO patient_alvo_disciplina
      (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio, vigencia_fim)
    VALUES (${CLINIC}, ${PATIENT}, ${opts.disciplina}, ${opts.horas},
            ${opts.inicio ?? "2026-01-01"}, ${opts.fim ?? null})
    RETURNING id`;
}

describe.skipIf(!hasDb)("0077 — prescrição como pilar mestre (DDL)", () => {
  beforeAll(async () => {
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'C203b') ON CONFLICT DO NOTHING`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC}, 'P203b') ON CONFLICT DO NOTHING`;
  });

  afterAll(async () => {
    if (!owner) return;
    await owner`DELETE FROM patient_alvo_disciplina WHERE patient_id = ${PATIENT}`;
    await owner`DELETE FROM patient WHERE id = ${PATIENT}`;
    await owner`DELETE FROM clinic WHERE id = ${CLINIC}`;
    await owner.end();
  });

  // ── 1 · índice único parcial no lado do teto ────────────────────────────────
  test("duas prescrições VIGENTES da mesma disciplina são rejeitadas", async () => {
    await prescrever({ disciplina: "Fonoaudiologia", horas: 20 });
    await expect(
      prescrever({ disciplina: "Fonoaudiologia", horas: 10 }),
    ).rejects.toThrow(/patient_alvo_unico_vigente/);
  });

  test("índice é PARCIAL: prescrição encerrada libera a disciplina", async () => {
    // É o que o SCD2 exige: represcrever guarda as duas passagens no histórico
    // e só a nova fica vigente. Índice não-parcial impediria a segunda linha e
    // forçaria UPDATE no lugar — exatamente o que a 0077 proíbe.
    await prescrever({
      disciplina: "Psicologia",
      horas: 8,
      fim: "2026-02-01",
    });
    await expect(
      prescrever({ disciplina: "Psicologia", horas: 12, inicio: "2026-02-01" }),
    ).resolves.toBeDefined();
  });

  test("disciplinas diferentes vigentes ao mesmo tempo passam", async () => {
    await expect(
      prescrever({ disciplina: "Terapia Ocupacional", horas: 4 }),
    ).resolves.toBeDefined();
  });

  test("o índice existe, é único e é parcial em vigencia_fim IS NULL", async () => {
    const [row] = await owner!<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'patient_alvo_disciplina'
         AND indexname = 'patient_alvo_unico_vigente'`;
    expect(row?.indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(row?.indexdef).toMatch(/patient_id, disciplina/);
    expect(row?.indexdef).toMatch(/WHERE \(vigencia_fim IS NULL\)/);
  });

  test("o índice não-único antigo foi removido (não paga escrita dobrada)", async () => {
    const linhas = await owner!`
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'patient_alvo_disciplina'
         AND indexname = 'idx_patient_alvo_vigente'`;
    expect(linhas).toHaveLength(0);
  });

  // ── 2 · SCD2 no nível do privilégio ─────────────────────────────────────────
  test("app_role NÃO pode reescrever horas_alvo_semana (histórico do convênio)", async () => {
    const [row] = await owner!<{ priv: boolean }[]>`
      SELECT has_column_privilege('app_role', 'patient_alvo_disciplina'::regclass,
                                  'horas_alvo_semana', 'UPDATE') AS priv`;
    expect(row!.priv).toBe(false);
  });

  test("app_role PODE fechar vigencia_fim (é assim que se represcreve)", async () => {
    const [row] = await owner!<{ priv: boolean }[]>`
      SELECT has_column_privilege('app_role', 'patient_alvo_disciplina'::regclass,
                                  'vigencia_fim', 'UPDATE') AS priv`;
    expect(row!.priv).toBe(true);
  });

  test("app_role continua podendo INSERIR e LER a prescrição", async () => {
    // Revogar demais quebraria a própria feature: prescrever é INSERT, e a
    // ficha clínica precisa listar o que está vigente.
    const [row] = await owner!<{ ins: boolean; sel: boolean }[]>`
      SELECT has_table_privilege('app_role', 'patient_alvo_disciplina', 'INSERT') AS ins,
             has_table_privilege('app_role', 'patient_alvo_disciplina', 'SELECT') AS sel`;
    expect(row!.ins).toBe(true);
    expect(row!.sel).toBe(true);
  });

  // ── 3 · prescrição não se apaga ─────────────────────────────────────────────
  test("app_role NÃO pode apagar prescrição", async () => {
    const [row] = await owner!<{ del: boolean }[]>`
      SELECT has_table_privilege('app_role', 'patient_alvo_disciplina', 'DELETE') AS del`;
    expect(row!.del).toBe(false);
  });

  test("a policy de DELETE também caiu (não fica órfã convidando a reconceder)", async () => {
    const linhas = await owner!`
      SELECT 1 FROM pg_policies
       WHERE tablename = 'patient_alvo_disciplina'
         AND policyname = 'patient_alvo_disciplina_delete'`;
    expect(linhas).toHaveLength(0);
  });
});
