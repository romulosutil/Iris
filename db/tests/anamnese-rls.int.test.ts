/**
 * #407 T02 — teste RLS VERMELHO de `anamnese`/`anamnese_alvo`, escrito ANTES
 * das policies (T03). Hoje (0115_anamnese_marco_zero.sql) as duas tabelas não
 * têm `ENABLE ROW LEVEL SECURITY`, nenhuma policy e nenhum GRANT para
 * `app_role` — só dono/superusuário (`MIGRATION_DATABASE_URL`) enxerga a
 * tabela. Rodando como app_role (`DATABASE_URL`, NUNCA a role dona — ela é
 * BYPASSRLS e mascararia todo caso, mesmo erro do precedente
 * `fase4-snapshot-rls.int.test.ts` que motiva reusar o harness daqui), toda
 * operação abaixo deve estourar `permission denied for table anamnese` (ou
 * `anamnese_alvo`) — SQLSTATE 42501 — porque não existe GRANT nenhum, não
 * porque a policy negou. Ver task-02-report.md para o erro exato observado
 * em cada caso e o comportamento esperado depois que T03 aplicar GRANT +
 * `ENABLE/FORCE ROW LEVEL SECURITY` + policies (predicado canônico copiado de
 * `instrumento_aplicacao`, 0113:27-69).
 *
 * Setup segue o harness de `db/tests/fase4-snapshot-rls.int.test.ts`: fixtures
 * inseridas pelo owner (bypassa RLS, simula estado pré-existente), asserts
 * rodam via `withTenant` (app_role) — mesmo padrão de `db/tests/fase2-rls.int.test.ts`
 * para "0 linhas afetadas prova o gate de authz sem depender da exceção do driver".
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000fa";
const CLINIC_B = "00000000-0000-0000-0000-0000000000fb";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0fa";
const U_T1_A = "00000000-0000-0000-0000-000000007a01"; // na equipe de PAC_A1
const U_T2_A = "00000000-0000-0000-0000-000000007a02"; // fora da equipe de PAC_A1
const U_T1_B = "00000000-0000-0000-0000-000000007b01"; // clínica B
const PAC_A1 = "00000000-0000-0000-0000-00000000aca1";
const PAC_B1 = "00000000-0000-0000-0000-00000000acb1";

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

let anamneseRascunhoA: string; // rascunho de PAC_A1, criado pelo coordenador A
let anamneseValidadaA: string; // validada de PAC_A1
let anamneseB: string; // rascunho de PAC_B1

describe.skipIf(!hasDb)(
  "#407 T02 · RLS de anamnese (vermelho, pré-T03)",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      schema = await import("@/db/schema");
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      anamnese, anamnese_alvo RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (anamnese)', false), (${CLINIC_B}, 'Clínica B (anamnese)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.anam@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.anam@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A', 't2.a.anam@t.com'),
      (${U_T1_B}, 'Terapeuta 1 B', 't1.b.anam@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T1_B}, ${CLINIC_B}, 'terapeuta')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (anamnese)'),
      (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (anamnese)')`;
      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

      // Escrito diretamente pelo owner (bypassa RLS) — simula estado
      // pré-existente; o teste é sobre isolamento/privilégio de app_role, não
      // sobre o caminho de escrita (T03/T05 escrevem GRANT+policy, não este
      // teste).
      const [rascunhoA] = await owner<{ id: string }[]>`
      INSERT INTO anamnese (clinic_id, patient_id, estado, criado_por)
      VALUES (${CLINIC_A}, ${PAC_A1}, 'rascunho', ${U_COORD_A})
      RETURNING id`;
      anamneseRascunhoA = rascunhoA!.id;

      const [validadaA] = await owner<{ id: string }[]>`
      INSERT INTO anamnese (clinic_id, patient_id, estado, criado_por, validada_por, validada_em)
      VALUES (${CLINIC_A}, ${PAC_A1}, 'validada', ${U_COORD_A}, ${U_COORD_A}, now())
      RETURNING id`;
      anamneseValidadaA = validadaA!.id;

      const [rascunhoB] = await owner<{ id: string }[]>`
      INSERT INTO anamnese (clinic_id, patient_id, estado, criado_por)
      VALUES (${CLINIC_B}, ${PAC_B1}, 'rascunho', ${U_T1_B})
      RETURNING id`;
      anamneseB = rascunhoB!.id;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    // ---------- isolamento cross-tenant ----------
    test("clínica A não lê anamnese da clínica B", async () => {
      const linhas = await withTenant(ctxCoordA, (tx) =>
        tx
          .select()
          .from(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseB)),
      );
      expect(linhas.length).toBe(0);
    });

    // ---------- isolamento intra-tenant (equipe) ----------
    test("terapeuta fora da equipe de PAC_A1 não lê a anamnese dele", async () => {
      const linhas = await withTenant(ctxT2A, (tx) =>
        tx
          .select()
          .from(schema.anamnese)
          .where(eq(schema.anamnese.patientId, PAC_A1)),
      );
      expect(linhas.length).toBe(0);
    });

    // ---------- caminho feliz: equipe lê e insere rascunho ----------
    test("terapeuta da equipe de PAC_A1 lê e insere rascunho de anamnese", async () => {
      const lidas = await withTenant(ctxT1A, (tx) =>
        tx
          .select()
          .from(schema.anamnese)
          .where(eq(schema.anamnese.patientId, PAC_A1)),
      );
      expect(lidas.length).toBeGreaterThan(0);

      const inseridas = await withTenant(ctxT1A, (tx) =>
        tx
          .insert(schema.anamnese)
          .values({
            clinicId: CLINIC_A,
            patientId: PAC_A1,
            estado: "rascunho",
            criadoPor: U_T1_A,
          })
          .returning({ id: schema.anamnese.id }),
      );
      expect(inseridas.length).toBe(1);
    });

    // ---------- append-only: validada não é editável por UPDATE genérico ----------
    test("UPDATE em anamnese validada afeta 0 linhas (append-only)", async () => {
      const alterados = await withTenant(ctxCoordA, (tx) =>
        tx
          .update(schema.anamnese)
          .set({ observacoes: "tentativa de editar validada" })
          .where(eq(schema.anamnese.id, anamneseValidadaA))
          .returning({ id: schema.anamnese.id }),
      );
      expect(alterados.length).toBe(0);

      const [lida] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ observacoes: schema.anamnese.observacoes })
          .from(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseValidadaA)),
      );
      expect(lida?.observacoes).not.toBe("tentativa de editar validada");
    });

    // ---------- coluna `estado` sem GRANT de coluna ----------
    test("UPDATE da coluna `estado` é negado por falta de GRANT de coluna", async () => {
      await expect(
        withTenant(ctxCoordA, (tx) =>
          tx
            .update(schema.anamnese)
            .set({ estado: "validada" })
            .where(eq(schema.anamnese.id, anamneseRascunhoA)),
        ),
      ).rejects.toThrow();
    });

    // ---------- DELETE de rascunho só por coordenador ----------
    test("terapeuta (não-coordenador) NÃO apaga rascunho de anamnese", async () => {
      const apagados = await withTenant(ctxT1A, (tx) =>
        tx
          .delete(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseRascunhoA))
          .returning({ id: schema.anamnese.id }),
      );
      expect(apagados.length).toBe(0);
    });

    test("coordenador apaga rascunho de anamnese", async () => {
      const apagados = await withTenant(ctxCoordA, (tx) =>
        tx
          .delete(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseRascunhoA))
          .returning({ id: schema.anamnese.id }),
      );
      expect(apagados.length).toBe(1);
    });
  },
);
