/**
 * Teste de integração do Hardening RLS da Fase 6.1 (PX1–PX4), contra Postgres
 * real. Roda com `pnpm test:rls` (vitest.integration.config.ts). Auto-skip sem
 * DB. Prova DUAS coisas independentes da policy de linha:
 *
 *  (A9) `has_column_privilege` = false nas colunas ditas imutáveis e true nas
 *       mutáveis — prova que a migração 0044 pegou (grant-por-coluna) e FALHA
 *       se alguma coluna imutável ainda for UPDATE-ável.
 *  (R6.1.5) reassociação intra-clínica: UPDATE de um FK imutável
 *       (session.patient_id) sob app_role deve ser barrado (permission denied),
 *       enquanto UPDATE de coluna mutável (estado) passa.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { withTenant, type TenantContext } from "./rls";
import { sql as appSql } from "./client";

const hasDb =
  !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

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
// espelha exatamente a 0044. Se a migração regredir, o teste quebra.
const IMMUTABLE: Record<string, string[]> = {
  session: ["patient_id", "terapeuta_id", "clinic_id", "criado_em"],
  patient_clinical_profile: ["patient_id", "criado_em"],
  patient_protocol: ["patient_id", "protocol_id", "ativado_por"],
  care_team_membership: ["patient_id", "user_id"],
  patient: ["clinic_id", "criado_em"],
};
const MUTABLE: Record<string, string> = {
  session: "estado",
  patient_clinical_profile: "diagnostico",
  patient_protocol: "desativado_em",
  care_team_membership: "disciplina",
  patient: "nome",
};

let owner: ReturnType<typeof postgres>;

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
    const [row] = await owner<{ estado: string }[]>`SELECT estado FROM session WHERE id = ${SESS}`;
    expect(row!.estado).toBe("realizada");
  });
});
