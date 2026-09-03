/**
 * Fase 4 (4A) — RLS da Evidence layer. Mesmo harness de db/tests/fase2-rls.int.test.ts.
 *
 * Prova os guardrails do DoD da spec (docs/superpowers/specs/2026-07-13-fase-4-ddl-4a-4b.md):
 *   - SELECT cross-tenant em `evidence` retorna 0.
 *   - SELECT cross-tenant ATRAVÉS de `evidence_current` retorna 0 (a view não
 *     pode bypassar RLS — teste crítico, B2).
 *   - UPDATE/DELETE em `evidence` por app_role falha (privilégio revogado).
 *   - INSERT em `evidence_revision`: permitido para coordenador, bloqueado
 *     para terapeuta (exceto resposta de EvidenceQuery aberta).
 */
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000e1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000e2";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0e1";
const U_T1_A = "00000000-0000-0000-0000-0000000071e1"; // dono da sessão, na equipe de PAC_A1
const U_T2_A = "00000000-0000-0000-0000-0000000072e1"; // fora da equipe de PAC_A1
const U_T1_B = "00000000-0000-0000-0000-0000000071e2"; // clínica B
const PAC_A1 = "00000000-0000-0000-0000-00000000ace1";
const PAC_B1 = "00000000-0000-0000-0000-00000000ace2";
const SESS_A1 = "00000000-0000-0000-0000-00000005e1e1";
const SESS_B1 = "00000000-0000-0000-0000-00000005e1e2";
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

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
let extractionId: string;

describe.skipIf(!hasDb)("Fase 4 (4A) · RLS da Evidence layer", () => {
  beforeAll(async () => {
    ({ withTenant } = await import("@/db/rls"));
    ({ sql: appSql } = await import("@/db/client"));
    schema = await import("@/db/schema");
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, extraction, evidence, evidence_revision, evidence_query
      RESTART IDENTITY CASCADE`;

    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (evidence)', false), (${CLINIC_B}, 'Clínica B (evidence)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.ev@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.ev@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A', 't2.a.ev@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b.ev@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (evidence)'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (evidence)')`;
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
      (${SESS_A1}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada', 1, 'aba'),
      (${SESS_B1}, ${CLINIC_B}, ${PAC_B1}, ${U_T1_B}, now(), 'realizada', 1, 'aba')`;

    const [ext] = await owner`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, revisado_por)
      VALUES (${SESS_A1}, ${CLINIC_A}, 'aprovada', 'evidencia', 'falou água sozinho', 'alta',
        ${owner.json({ descricao: "pediu água", alvos: [{ goal_id: null, protocol_id: null, dominio_id: "mando" }] })},
        ${U_T1_A})
      RETURNING id`;
    extractionId = ext!.id as string;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta dono insere evidence a partir da aprovação e lê", async () => {
    const [ev] = await withTenant(ctxT1A, (tx) =>
      tx
        .insert(schema.evidence)
        .values({
          extractionId,
          patientId: PAC_A1,
          sessionId: SESS_A1,
          sessionNumero: 1,
          alvoOrdinal: 0,
          dominioId: "mando",
          classificacaoOriginal: { descricao: "pediu água" },
          aprovadoPor: U_T1_A,
        })
        .returning({ id: schema.evidence.id }),
    );
    expect(ev?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.evidence),
    );
    expect(lidas.length).toBe(1);
  });

  test("2 alvos da MESMA extração com FKs nulos geram 2 linhas (ordinal 0 e 1)", async () => {
    // Prova que a idempotência não colapsa mais: antes, `(extraction_id,
    // goal_id, milestone_id)` com NULLS NOT DISTINCT viraria `(id, null, null)`
    // para ambos e o segundo insert falharia. Agora o discriminador é o ordinal.
    const [ev1] = await withTenant(ctxT1A, (tx) =>
      tx
        .insert(schema.evidence)
        .values({
          extractionId,
          patientId: PAC_A1,
          sessionId: SESS_A1,
          sessionNumero: 1,
          alvoOrdinal: 1, // ordinal 0 já foi inserido no teste anterior
          protocolSlug: "vbmapp",
          dominioId: "mando",
          goalRef: "meta-livre-1",
          classificacaoOriginal: { descricao: "segundo alvo, mesmo payload" },
          aprovadoPor: U_T1_A,
        })
        .returning({ id: schema.evidence.id }),
    );
    expect(ev1?.id).toBeTruthy();

    const lidas = await withTenant(ctxT1A, (tx) =>
      tx.select().from(schema.evidence),
    );
    expect(lidas.length).toBe(2);
    // ambos com FKs resolvidos nulos, distinguidos só pelo ordinal
    expect(
      lidas.every((e) => e.goalId === null && e.milestoneId === null),
    ).toBe(true);
    expect(new Set(lidas.map((e) => e.alvoOrdinal))).toEqual(new Set([0, 1]));
  });

  test("terapeuta fora da equipe de PAC_A1 NÃO vê a evidence", async () => {
    const lidas = await withTenant(ctxT2A, (tx) =>
      tx.select().from(schema.evidence),
    );
    expect(lidas.length).toBe(0);
  });

  test("cross-tenant: terapeuta da clínica B NÃO vê evidence da clínica A (tabela base)", async () => {
    const lidas = await withTenant(ctxT1B, (tx) =>
      tx.select().from(schema.evidence),
    );
    expect(lidas.length).toBe(0);
  });

  test("cross-tenant ATRAVÉS de evidence_current retorna 0 linhas (view não bypassa RLS)", async () => {
    // Teste crítico do DoD (B2): a view usa security_invoker — sem isso ela
    // rodaria com os direitos do dono e vazaria entre clínicas.
    const linhas = await withTenant(ctxT1B, (tx) =>
      tx.execute(sql`SELECT * FROM evidence_current`),
    );
    expect(linhas.length).toBe(0);
  });

  test("terapeuta da equipe de PAC_A1 vê a evidence ATRAVÉS de evidence_current", async () => {
    const linhas = await withTenant(ctxT1A, (tx) =>
      tx.execute(sql`SELECT * FROM evidence_current`),
    );
    expect(linhas.length).toBe(2); // as 2 evidences inseridas acima, ambas na equipe
    expect(
      (linhas[0] as { classificacao_atual: unknown }).classificacao_atual,
    ).toBeTruthy();
  });

  test("UPDATE em evidence por app_role falha (privilégio revogado)", async () => {
    const [ev] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx
          .update(schema.evidence)
          .set({ classificacaoOriginal: { hack: true } })
          .where(eq(schema.evidence.id, ev!.id)),
      ),
    ).rejects.toThrow();
  });

  test("DELETE em evidence por app_role falha (privilégio revogado)", async () => {
    const [ev] = await withTenant(ctxCoordA, (tx) =>
      tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
    );
    await expect(
      withTenant(ctxCoordA, (tx) =>
        tx.delete(schema.evidence).where(eq(schema.evidence.id, ev!.id)),
      ),
    ).rejects.toThrow();
  });

  describe("evidence_revision — escrita restrita ao coordenador (V1)", () => {
    test("coordenador insere evidence_revision (reclassificar)", async () => {
      const [ev] = await withTenant(ctxCoordA, (tx) =>
        tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
      );
      const [rev] = await withTenant(ctxCoordA, (tx) =>
        tx
          .insert(schema.evidenceRevision)
          .values({
            evidenceId: ev!.id,
            acao: "reclassificar",
            classificacaoAnterior: { descricao: "pediu água" },
            classificacaoNova: { descricao: "pediu água (reclassificado)" },
            justificativa: "ajuste de função",
            autorId: U_COORD_A,
          })
          .returning({ id: schema.evidenceRevision.id }),
      );
      expect(rev?.id).toBeTruthy();
    });

    test("terapeuta (sem evidence_query aberta) NÃO insere evidence_revision", async () => {
      const [ev] = await withTenant(ctxCoordA, (tx) =>
        tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
      );
      await expect(
        withTenant(ctxT1A, (tx) =>
          tx.insert(schema.evidenceRevision).values({
            evidenceId: ev!.id,
            acao: "confirmar",
            classificacaoAnterior: { descricao: "pediu água" },
            justificativa: "tentativa indevida",
            autorId: U_T1_A,
          }),
        ),
      ).rejects.toThrow();
    });

    test("terapeuta da equipe RESPONDE evidence_revision quando há evidence_query aberta (exceção V2)", async () => {
      const [ev] = await withTenant(ctxCoordA, (tx) =>
        tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
      );
      await withTenant(ctxCoordA, (tx) =>
        tx.insert(schema.evidenceQuery).values({
          evidenceId: ev!.id,
          coordenadorId: U_COORD_A,
          pergunta: "Confirma a função observada?",
        }),
      );
      const [rev] = await withTenant(ctxT1A, (tx) =>
        tx
          .insert(schema.evidenceRevision)
          .values({
            evidenceId: ev!.id,
            acao: "confirmar",
            classificacaoAnterior: { descricao: "pediu água" },
            justificativa: "resposta do terapeuta à dúvida do coordenador",
            autorId: U_T1_A,
          })
          .returning({ id: schema.evidenceRevision.id }),
      );
      expect(rev?.id).toBeTruthy();
    });

    test("tentativa de falsificar aprovado_por no insert de evidence levanta exceção RLS", async () => {
      await expect(
        withTenant(ctxT1A, (tx) =>
          tx.insert(schema.evidence).values({
            extractionId,
            patientId: PAC_A1,
            sessionId: SESS_A1,
            sessionNumero: 1,
            alvoOrdinal: 99, // ordinal diferente p/ evitar unique key constraint
            protocolSlug: "vbmapp",
            dominioId: "mando",
            classificacaoOriginal: { descricao: "tentativa de hack" },
            aprovadoPor: U_COORD_A, // impersonating coordinator
          }),
        ),
      ).rejects.toThrow();
    });

    test("tentativa de falsificar autor_id no insert de evidence_revision levanta exceção RLS", async () => {
      const [ev] = await withTenant(ctxCoordA, (tx) =>
        tx.select({ id: schema.evidence.id }).from(schema.evidence).limit(1),
      );
      await expect(
        withTenant(ctxCoordA, (tx) =>
          tx.insert(schema.evidenceRevision).values({
            evidenceId: ev!.id,
            acao: "reclassificar",
            classificacaoAnterior: { descricao: "pediu água" },
            classificacaoNova: { descricao: "hacked" },
            justificativa: "hack",
            autorId: U_T1_A, // impersonating therapist
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
