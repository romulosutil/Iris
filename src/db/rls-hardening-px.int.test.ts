/**
 * Teste de integração do Hardening RLS da Fase 6.1 (PX1–PX4), contra Postgres
 * real. Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem
 * DB. Prova DUAS coisas independentes da policy de linha:
 *
 *  (A9) `has_column_privilege` = false nas colunas ditas imutáveis e true nas
 *       mutáveis — prova que as migrações 0044 e 0079 pegaram (grant-por-coluna)
 *       e FALHA se alguma coluna imutável ainda for UPDATE-ável.
 *  (R6.1.5) reassociação intra-clínica: UPDATE de um FK imutável
 *       (session.patient_id) sob app_role deve ser barrado (permission denied),
 *       enquanto UPDATE de coluna mutável (estado) passa.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { withTenant, type TenantContext } from "./rls";
import { sql as appSql } from "./client";
import { hasDb } from "@tests/integration-env";

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002";
const P1 = "b0000000-0000-0000-0000-000000000001";
const P2 = "b0000000-0000-0000-0000-000000000002";
const SESS = "d0000000-0000-0000-0000-000000000001";

const ctx = (
  role: TenantContext["role"],
  userId: string,
  clinicId = CLINIC_A,
) => ({ role, userId, clinicId }) satisfies TenantContext;

// Colunas imutáveis (deve ser false) e mutáveis (deve ser true) por tabela —
// espelha exatamente a 0044 (e a 0079 para `clinic`). Se a migração regredir, o
// teste quebra.
const IMMUTABLE: Record<string, string[]> = {
  session: ["patient_id", "terapeuta_id", "clinic_id", "criado_em"],
  patient_clinical_profile: ["patient_id", "criado_em"],
  patient_protocol: ["patient_id", "protocol_id", "ativado_por"],
  care_team_membership: ["patient_id", "user_id"],
  patient: ["clinic_id", "criado_em"],
  clinic: [
    "id",
    "responsavel_conta_id",
    "is_demo",
    "trial_comeco_em",
    "trial_dias",
    "isento_trial",
    "criado_em",
  ],
};
const MUTABLE: Record<string, string> = {
  session: "estado",
  patient_clinical_profile: "diagnostico",
  patient_protocol: "desativado_em",
  care_team_membership: "disciplina",
  patient: "nome",
  clinic: "nome",
};

let owner: ReturnType<typeof postgres>;

/**
 * O Drizzle embrulha o erro do Postgres num `DrizzleQueryError` cuja `message` é
 * só "Failed query: ..." — a razão real (`permission denied` vs. "violates
 * row-level security policy") fica na `cause`. Asserir só `.rejects.toThrow()`
 * não distinguiria "barrado por privilégio" de "barrado pela RLS", que é
 * exatamente a diferença que estes testes existem para provar. Devolve string
 * vazia se a promessa resolver — aí o `toMatch` falha, como deve.
 */
async function erroBruto(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.cause?.message ?? ""} | ${err.message ?? ""}`;
  }
}

describe.skipIf(!hasDb)("Hardening RLS Fase 6.1 (PX1–PX4)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, patient_clinical_profile, care_team_membership, protocol, patient_protocol, session RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord', 'coord@a.test'),
      (${U_TERA}, 'Tera', 'tera@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_TERA}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC_A}, 'Paciente 1'),
      (${P2}, ${CLINIC_A}, 'Paciente 2')`;
    // U_TERA é da equipe de P1 (habilita o USING da session_update p/ terapeuta).
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${P1}, ${U_TERA}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
      (${SESS}, ${CLINIC_A}, ${P1}, ${U_TERA}, now(), 'ABA')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  // ── A9 · prova de imutabilidade via privilégio de coluna ──────────────────
  for (const [tabela, cols] of Object.entries(IMMUTABLE)) {
    for (const col of cols) {
      test(`A9: app_role NÃO tem UPDATE em ${tabela}.${col} (imutável)`, async () => {
        const [row] = await owner<{ priv: boolean }[]>`
          SELECT has_column_privilege('app_role', ${tabela}::regclass, ${col}, 'UPDATE') AS priv`;
        expect(row!.priv).toBe(false);
      });
    }
    const mut = MUTABLE[tabela]!;
    test(`A9: app_role TEM UPDATE em ${tabela}.${mut} (mutável)`, async () => {
      const [row] = await owner<{ priv: boolean }[]>`
        SELECT has_column_privilege('app_role', ${tabela}::regclass, ${mut}, 'UPDATE') AS priv`;
      expect(row!.priv).toBe(true);
    });
  }

  // ── D3 (#188) · defesa em profundidade em `clinic`, independente de policy ─
  // A 0002 dá a `app_role` só uma policy `FOR SELECT` em `clinic`, então uma
  // escrita hoje já não atinge linha. Estes dois testes provam a camada de
  // BAIXO: mesmo que uma policy de escrita apareça amanhã, o privilégio não
  // existe — o erro é `permission denied`, levantado antes da RLS ser avaliada.
  test("D3: app_role NÃO tem INSERT em clinic (privilégio, não policy)", async () => {
    const [row] = await owner<{ priv: boolean }[]>`
      SELECT has_table_privilege('app_role', 'clinic'::regclass, 'INSERT') AS priv`;
    expect(row!.priv).toBe(false);
    expect(
      await erroBruto(
        withTenant(ctx("coordenador", U_COORD), (db) =>
          db.execute(sql`INSERT INTO clinic (nome) VALUES ('forjada')`),
        ),
      ),
    ).toMatch(/permission denied/i);
  });

  test("D3: UPDATE de clinic.isento_trial sob app_role é BARRADO por privilégio", async () => {
    expect(
      await erroBruto(
        withTenant(ctx("coordenador", U_COORD), (db) =>
          db.execute(
            sql`UPDATE clinic SET isento_trial = true WHERE id = ${CLINIC_A}`,
          ),
        ),
      ),
    ).toMatch(/permission denied/i);
  });

  // ── R6.1.5 · reassociação por UPDATE de FK imutável ───────────────────────
  test("reassociação: UPDATE de session.patient_id (FK imutável) é BARRADO", async () => {
    await expect(
      withTenant(ctx("terapeuta", U_TERA), (db) =>
        db.execute(
          sql`UPDATE session SET patient_id = ${P2} WHERE id = ${SESS}`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("reassociação: UPDATE de coluna mutável (estado) NÃO superbloqueia", async () => {
    await withTenant(ctx("terapeuta", U_TERA), (db) =>
      db.execute(
        sql`UPDATE session SET estado = 'realizada' WHERE id = ${SESS}`,
      ),
    );
    const [row] = await owner<
      { estado: string }[]
    >`SELECT estado FROM session WHERE id = ${SESS}`;
    expect(row!.estado).toBe("realizada");
  });
});
