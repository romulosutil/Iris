/**
 * #407 T09 — prova de que `salvarRascunhoAnamnese` NÃO produz efeito na linha
 * do tempo clínica. Um rascunho é material de trabalho do avaliador: ele não
 * cria `goal` nem `session_snapshot` — isso só acontece na validação (T10/T14),
 * bem depois, e por outro caminho. Este teste mede os dois contadores ANTES e
 * DEPOIS de chamar o core e exige que fiquem INALTERADOS — não apenas "não
 * cresceram além do esperado", mas exatamente iguais.
 *
 * Setup segue o harness de `db/tests/anamnese-rls.int.test.ts` (mesmo domínio):
 * fixtures inseridas pelo owner (bypassa RLS), asserts via `withTenant`
 * (app_role).
 */
import { count, eq, and } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000009fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000c9fa";
const U_T1_A = "00000000-0000-0000-0000-000000097a01"; // na equipe de PAC_A1
const PAC_A1 = "00000000-0000-0000-0000-00000009aca1";

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

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let schema: typeof import("@/db/schema");
let salvarRascunhoAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").salvarRascunhoAnamnese;

async function contarGoalESnapshot(patientId: string) {
  const [goals] = await withTenant(ctxCoordA, (tx) =>
    tx
      .select({ n: count() })
      .from(schema.goal)
      .where(eq(schema.goal.patientId, patientId)),
  );
  const [snapshots] = await withTenant(ctxCoordA, (tx) =>
    tx
      .select({ n: count() })
      .from(schema.sessionSnapshot)
      .where(
        and(
          eq(schema.sessionSnapshot.patientId, patientId),
          eq(schema.sessionSnapshot.sessionNumero, 0),
        ),
      ),
  );
  return { goals: Number(goals!.n), snapshots: Number(snapshots!.n) };
}

describe.skipIf(!hasDb)(
  "#407 T09 · salvarRascunhoAnamnese não mexe na linha do tempo",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      schema = await import("@/db/schema");
      ({ salvarRascunhoAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`TRUNCATE clinic, app_user, user_role, patient,
      care_team_membership, anamnese, anamnese_alvo, goal, session_snapshot
      RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clínica A (anamnese-rascunho)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.anam-rasc@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.anam-rasc@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (anamnese-rascunho)')`;
      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;
    });

    afterAll(async () => {
      await owner?.end();
    });

    const alvoValido = {
      eixo: "comunicacao_expressiva" as const,
      descricao: "Pedir objeto desejado apontando",
      procedencia: "relatado_responsavel" as const,
    };

    test("terapeuta da equipe salva rascunho sem criar goal nem session_snapshot", async () => {
      const antes = await contarGoalESnapshot(PAC_A1);

      const resultado = await salvarRascunhoAnamnese(ctxT1A, {
        patientId: PAC_A1,
        alvos: [alvoValido],
      });

      expect(resultado.error).toBeUndefined();
      expect(resultado.id).toBeTruthy();

      const depois = await contarGoalESnapshot(PAC_A1);
      expect(depois).toEqual(antes);

      const [linha] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ estado: schema.anamnese.estado })
          .from(schema.anamnese)
          .where(eq(schema.anamnese.id, resultado.id!)),
      );
      expect(linha?.estado).toBe("rascunho");

      const alvosGravados = await withTenant(ctxCoordA, (tx) =>
        tx
          .select()
          .from(schema.anamneseAlvo)
          .where(eq(schema.anamneseAlvo.anamneseId, resultado.id!)),
      );
      expect(alvosGravados.length).toBe(1);
    });

    test("coordenador também salva rascunho sem criar goal nem session_snapshot", async () => {
      const antes = await contarGoalESnapshot(PAC_A1);

      const resultado = await salvarRascunhoAnamnese(ctxCoordA, {
        patientId: PAC_A1,
        alvos: [alvoValido],
      });

      expect(resultado.error).toBeUndefined();

      const depois = await contarGoalESnapshot(PAC_A1);
      expect(depois).toEqual(antes);
    });
  },
);
