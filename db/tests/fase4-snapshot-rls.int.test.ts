/**
 * Fase 4 (4B) — RLS de `session_snapshot`. Mesmo harness de
 * db/tests/fase4-evidence-rls.int.test.ts.
 *
 * Prova os guardrails da spec (docs/superpowers/specs/2026-07-13-fase-4-ddl-4a-4b.md §4B.2):
 *   - SELECT cross-tenant em `session_snapshot` retorna 0.
 *   - app_role NÃO tem INSERT/UPDATE/DELETE (só a função definer escreve).
 *   - coordenador/terapeuta-da-equipe leem linhas da própria clínica.
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000f1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000f2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0f1";
const U_T1_A = "00000000-0000-0000-0000-00000000710f"; // na equipe de PAC_A1
const U_T2_A = "00000000-0000-0000-0000-00000000720f"; // fora da equipe de PAC_A1
const U_T1_B = "00000000-0000-0000-0000-00000000710e"; // clínica B
const PAC_A1 = "00000000-0000-0000-0000-00000000acf1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acf2";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxT1A = {
  clinicId: CLINIC_A,
  userId: U_T1_A,
  role: "terapeuta",
} as const;
const ctxT2A = {
  clinicId: CLINIC_A,
  userId: U_T2_A,
  role: "terapeuta",
} as const;
const ctxT1B = {
  clinicId: CLINIC_B,
  userId: U_T1_B,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");

describe.skipIf(!hasDb)("Fase 4 (4B) · RLS de session_snapshot", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session_snapshot RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (snapshot)', false), (${CLINIC_B}, 'Clínica B (snapshot)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.snap@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.snap@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A', 't2.a.snap@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b.snap@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (snapshot)'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (snapshot)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

    // Escrito diretamente pelo owner (bypassa RLS) — simula o que a função
    // definer produziria; o teste é sobre LEITURA/privilégio, não sobre a
    // lógica de materialização (fora de escopo desta tarefa).
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao)
      VALUES
        (${PAC_A1}, 1, ${owner.json({})}, ${owner.json({})}),
        (${PAC_B1}, 1, ${owner.json({})}, ${owner.json({})})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("coordenador vê snapshot da própria clínica", async () => {
    const linhas = await withTenant(ctxCoordA, (tx) =>
      tx.select().from(schema.sessionSnapshot),
    );
    expect(linhas.length).toBe(1);
    expect(linhas[0]?.patientId).toBe(PAC_A1);
  });

  test("terapeuta da equipe de PAC_A1 vê o snapshot", async () => {
    const linhas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.sessionSnapshot),
    );
    expect(linhas.length).toBe(1);
  });

  test("terapeuta fora da equipe de PAC_A1 NÃO vê o snapshot", async () => {
    const linhas = await withTenant(ctxT2A, (tx) =>
      tx.select().from(schema.sessionSnapshot),
    );
    expect(linhas.length).toBe(0);
  });

  test("cross-tenant: terapeuta da clínica B NÃO vê snapshot da clínica A", async () => {
    const linhas = await withTenant(ctxT1B, (tx) =>
      tx.select().from(schema.sessionSnapshot),
    );
    expect(linhas.length).toBe(0);
  });

  test("app_role NÃO tem INSERT em session_snapshot (privilégio não concedido)", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.sessionSnapshot).values({
          patientId: PAC_A1,
          sessionNumero: 2,
          repertorioState: {},
          segmentacao: {},
        }),
      ),
    ).rejects.toThrow();
  });

  test("app_role NÃO tem UPDATE em session_snapshot (privilégio não concedido)", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx
          .update(schema.sessionSnapshot)
          .set({ repertorioState: { hack: true } })
          .where(eq(schema.sessionSnapshot.patientId, PAC_A1)),
      ),
    ).rejects.toThrow();
  });

  test("app_role NÃO tem DELETE em session_snapshot (privilégio não concedido)", async () => {
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx
          .delete(schema.sessionSnapshot)
          .where(eq(schema.sessionSnapshot.patientId, PAC_A1)),
      ),
    ).rejects.toThrow();
  });

  test("session_numero = 0 (marco zero) respeita o mesmo isolamento de RLS (ANAM-04 / T23)", async () => {
    // Insere snapshot 0 para PAC_A1
    await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao)
      VALUES (${PAC_A1}, 0, ${owner.json({ marco: 0 })}, ${owner.json({})})
      ON CONFLICT (patient_id, session_numero) DO NOTHING`;

    // Coordenador da clínica A vê o snapshot 0
    const coordLinhas = await withTenant(ctxCoordA, (tx) =>
      tx
        .select()
        .from(schema.sessionSnapshot)
        .where(eq(schema.sessionSnapshot.sessionNumero, 0)),
    );
    expect(coordLinhas.length).toBe(1);
    expect(coordLinhas[0]?.patientId).toBe(PAC_A1);

    // Terapeuta da equipe de PAC_A1 vê o snapshot 0
    const t1Linhas = await withTenant(ctxT1A, (tx) =>
      tx
        .select()
        .from(schema.sessionSnapshot)
        .where(eq(schema.sessionSnapshot.sessionNumero, 0)),
    );
    expect(t1Linhas.length).toBe(1);

    // Terapeuta fora da equipe de PAC_A1 NÃO vê o snapshot 0
    const t2Linhas = await withTenant(ctxT2A, (tx) =>
      tx
        .select()
        .from(schema.sessionSnapshot)
        .where(eq(schema.sessionSnapshot.sessionNumero, 0)),
    );
    expect(t2Linhas.length).toBe(0);

    // Cross-tenant: terapeuta da clínica B NÃO vê snapshot 0 da clínica A
    const t1BLinhas = await withTenant(ctxT1B, (tx) =>
      tx
        .select()
        .from(schema.sessionSnapshot)
        .where(eq(schema.sessionSnapshot.sessionNumero, 0)),
    );
    expect(t1BLinhas.length).toBe(0);

    // app_role NÃO tem INSERT direto em session_numero = 0
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.sessionSnapshot).values({
          patientId: PAC_A1,
          sessionNumero: 0,
          repertorioState: {},
          segmentacao: {},
        }),
      ),
    ).rejects.toThrow();
  });
});
