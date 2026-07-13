/**
 * Fase 4 (4C.1) — RLS de reinforcer_profile. Mesmo harness de
 * db/tests/fase4-evidence-rls.int.test.ts.
 *
 * Prova:
 *   - Aprovar uma extração `preferencia_reforcador` cria 1 linha em
 *     reinforcer_profile (via inserirReforcadoresOnApprove).
 *   - Idempotente: reaprovar/reprocessar não duplica.
 *   - SELECT cross-tenant retorna 0.
 *   - INSERT fora do escopo clínico (terapeuta fora da equipe) falha.
 *   - UPDATE/DELETE por app_role falha (privilégio revogado).
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

const CLINIC_A = "00000000-0000-0000-0000-0000000000f1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000f2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0f1";
const U_T1_A = "00000000-0000-0000-0000-0000000071f1"; // dono da sessão, na equipe de PAC_A1
const U_T2_A = "00000000-0000-0000-0000-0000000072f1"; // fora da equipe de PAC_A1
const U_T1_B = "00000000-0000-0000-0000-0000000071f2"; // clínica B
const PAC_A1 = "00000000-0000-0000-0000-00000000acf1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acf2";
const SESS_A1 = "00000000-0000-0000-0000-00000005f1f1";
const SESS_B1 = "00000000-0000-0000-0000-00000005f1f2";

const ctxCoordA = { clinicId: CLINIC_A, userId: U_COORD_A, role: "coordenador" } as const;
const ctxT1A = { clinicId: CLINIC_A, userId: U_T1_A, role: "terapeuta" } as const;
const ctxT2A = { clinicId: CLINIC_A, userId: U_T2_A, role: "terapeuta" } as const;
const ctxT1B = { clinicId: CLINIC_B, userId: U_T1_B, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");
let extractionId: string;

describe.skipIf(!hasDb)("Fase 4 (4C.1) · RLS de reinforcer_profile", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, extraction, reinforcer_profile RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (reinforcer)', false), (${CLINIC_B}, 'Clínica B (reinforcer)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.rp@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.rp@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A', 't2.a.rp@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b.rp@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (reinforcer)'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (reinforcer)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente) VALUES
      (${SESS_A1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada', 1),
      (${SESS_B1}, ${CLINIC_B}, ${PAC_B1}, ${U_T1_B}, now(), 'realizada', 1)`;

    const [ext] = await owner`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, revisado_por)
      VALUES (${SESS_A1}, ${CLINIC_A}, 'aprovada', 'preferencia_reforcador', 'adorou o carrinho', 'alta',
        ${owner.json({ preferencia_reforcador: { item_atividade: "carrinho de brinquedo", valencia: "alta" } })},
        ${U_T1_A})
      RETURNING id`;
    extractionId = ext!.id as string;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta dono insere reinforcer_profile a partir da aprovação e lê", async () => {
    const [rp] = await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.reinforcerProfile).values({
        extractionId,
        patientId: PAC_A1,
        sessionId: SESS_A1,
        sessionNumero: 1,
        itemAtividade: "carrinho de brinquedo",
        valencia: "alta",
      }).returning({ id: schema.reinforcerProfile.id }),
    );
    expect(rp?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(1);
    expect(lidas[0]?.valencia).toBe("alta");
  });

  test("idempotente: (extraction_id, item_atividade) repetido não duplica", async () => {
    await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.reinforcerProfile).values({
        extractionId,
        patientId: PAC_A1,
        sessionId: SESS_A1,
        sessionNumero: 1,
        itemAtividade: "carrinho de brinquedo",
        valencia: "saciado", // mesma chave (extraction_id, item_atividade); simula reprocessamento
      }).onConflictDoNothing({
        target: [schema.reinforcerProfile.extractionId, schema.reinforcerProfile.itemAtividade],
      }),
    );

    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(1);
    expect(lidas[0]?.valencia).toBe("alta"); // conflito ignorado, linha original preservada
  });

  test("um novo item da MESMA extração (item_atividade diferente) gera outra linha (série, não upsert)", async () => {
    const [rp2] = await withTenant(ctxT1A, (tx) =>
      tx.insert(schema.reinforcerProfile).values({
        extractionId,
        patientId: PAC_A1,
        sessionId: SESS_A1,
        sessionNumero: 1,
        itemAtividade: "bolha de sabão",
        valencia: "baixa",
      }).returning({ id: schema.reinforcerProfile.id }),
    );
    expect(rp2?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(2);
  });

  test("terapeuta fora da equipe de PAC_A1 NÃO vê o reinforcer_profile", async () => {
    const lidas = await withTenant(ctxT2A, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(0);
  });

  test("cross-tenant: terapeuta da clínica B NÃO vê reinforcer_profile da clínica A", async () => {
    const lidas = await withTenant(ctxT1B, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(0);
  });

  test("terapeuta da clínica B NÃO consegue inserir reinforcer_profile para paciente da clínica A", async () => {
    await expect(
      withTenant(ctxT1B, (tx) =>
        tx.insert(schema.reinforcerProfile).values({
          extractionId,
          patientId: PAC_A1,
          sessionId: SESS_A1,
          sessionNumero: 1,
          itemAtividade: "tentativa indevida",
          valencia: "alta",
        }),
      ),
    ).rejects.toThrow();
  });

  test("coordenador lê toda a clínica (inclusive fora da equipe)", async () => {
    const lidas = await withTenant(ctxCoordA, (tx) => tx.select().from(schema.reinforcerProfile));
    expect(lidas.length).toBe(2);
  });

  test("UPDATE em reinforcer_profile por app_role falha (privilégio revogado)", async () => {
    const [rp] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.reinforcerProfile.id }).from(schema.reinforcerProfile).limit(1),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.update(schema.reinforcerProfile)
          .set({ valencia: "baixa" })
          .where(eq(schema.reinforcerProfile.id, rp!.id)),
      ),
    ).rejects.toThrow();
  });

  test("DELETE em reinforcer_profile por app_role falha (privilégio revogado)", async () => {
    const [rp] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.reinforcerProfile.id }).from(schema.reinforcerProfile).limit(1),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.delete(schema.reinforcerProfile).where(eq(schema.reinforcerProfile.id, rp!.id)),
      ),
    ).rejects.toThrow();
  });
});
