/**
 * #407 T10 — prova de que `validarAnamnese` FAZ a linha do tempo clínica
 * existir: cria uma `goal` por alvo e faz o snapshot 0 passar a existir. É o
 * lado A de `db/tests/anamnese-rascunho.int.test.ts` (T09, lado B: rascunho
 * não mexe em nada). Mede os mesmos dois contadores, agora esperando que
 * mudem.
 *
 * Setup reaproveita o harness de `db/tests/anamnese-validar-definer.int.test.ts`
 * (T04/T05: protocolo com `taxonomia_ajuda` de 5 níveis, `patient_protocol`
 * ativo) e `db/tests/anamnese-rascunho.int.test.ts` (equipe/paciente).
 */
import { and, count, eq, sql as sqlTag } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000010fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000109a";
const PAC_VALIDAR = "00000000-0000-0000-0000-000000010a01";
const PAC_ROLLBACK = "00000000-0000-0000-0000-000000010a02";
const PAC_MILESTONE = "00000000-0000-0000-0000-000000010a03";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let schema: typeof import("@/db/schema");
let validarAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").validarAnamnese;

let PROTOCOL_ID: string;
let MILESTONE_ID: string;

async function ativarProtocolo(patientId: string) {
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
    VALUES (${patientId}, ${PROTOCOL_ID}, ${U_COORD_A})`;
}

async function criarAnamneseRascunho(opts: {
  id: string;
  patientId: string;
  alvos: {
    id: string;
    eixo?: string;
    descricao: string;
    milestoneId?: string | null;
    nivelAjudaInicial?: number | null;
    procedencia?: string;
  }[];
}) {
  await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
    VALUES (${opts.id}, ${CLINIC_A}, ${opts.patientId}, 'rascunho', ${U_COORD_A})`;
  for (const alvo of opts.alvos) {
    await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvo.id}, ${opts.id}, ${CLINIC_A}, ${opts.patientId},
        ${alvo.eixo ?? "comunicacao_expressiva"}, ${alvo.descricao},
        ${alvo.milestoneId ?? null}, ${alvo.nivelAjudaInicial ?? null},
        ${alvo.procedencia ?? "relatado_responsavel"})`;
  }
}

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

/**
 * Verbatim de `db/tests/anamnese-validar-definer.int.test.ts:erroDe` — a
 * mensagem real do Postgres (RAISE) fica em `.cause`, não em
 * `DrizzleQueryError.message` (que é o texto do statement que emitimos).
 */
async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const partes: string[] = [];
    let atual: unknown = e;
    while (atual && typeof atual === "object") {
      const o = atual as {
        message?: unknown;
        detail?: unknown;
        cause?: unknown;
      };
      if (o.message) partes.push(String(o.message));
      if (o.detail) partes.push(String(o.detail));
      atual = o.cause;
    }
    return partes.join(" | ");
  }
  throw new Error("esperava rejeição, mas a operação foi bem-sucedida");
}

describe.skipIf(!hasDb)(
  "#407 T10 · validarAnamnese cria goal e faz o snapshot 0 existir",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      schema = await import("@/db/schema");
      ({ validarAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`TRUNCATE clinic, app_user, user_role, patient,
      care_team_membership, protocol, patient_protocol, milestone,
      anamnese, anamnese_alvo, goal, goal_milestone_mapping, session_snapshot,
      audit_log RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
        VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
        ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
        (${CLINIC_A}, 'Clínica A (anamnese-validar)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
        (${U_COORD_A}, 'Coord A', 'coord.a.anam-val@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
        (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
        (${PAC_VALIDAR}, ${CLINIC_A}, 'Paciente validar (T10)'),
        (${PAC_ROLLBACK}, ${CLINIC_A}, 'Paciente rollback (T10)'),
        (${PAC_MILESTONE}, ${CLINIC_A}, 'Paciente milestone (T10)')`;

      const [protocolo] = await owner<{ id: string }[]>`
        INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
        VALUES (${CLINIC_A}, 'VB-MAPP (teste T10)', 'ABA', ${PROTOCOL_FAMILIA},
          ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
        RETURNING id`;
      PROTOCOL_ID = protocolo!.id;

      const [marco] = await owner<{ id: string }[]>`
        INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
        VALUES (${PROTOCOL_ID}, 'mando', 'Pedir item preferido', 'marco_simples', '{}'::jsonb)
        RETURNING id`;
      MILESTONE_ID = marco!.id;

      await ativarProtocolo(PAC_VALIDAR);
      await ativarProtocolo(PAC_MILESTONE);
      // PAC_ROLLBACK NÃO tem protocolo ativo de propósito — o gate
      // ANAMNESE_SEM_PROTOCOLO_ATIVO do definer (T05) dispara depois que o
      // core já inseriu a `goal`, provando que o RAISE reverte a inserção.
    });

    afterAll(async () => {
      await owner?.end();
    });

    test("valida rascunho → goal criada por alvo, snapshot 0 passa de 0 para 1, anamnese_alvo.goal_id preenchido", async () => {
      const antes = await contarGoalESnapshot(PAC_VALIDAR);
      expect(antes.snapshots).toBe(0);

      const anamneseId = "00000000-0000-0000-0000-000000010d01";
      const alvoId = "00000000-0000-0000-0000-000000010e01";
      await criarAnamneseRascunho({
        id: anamneseId,
        patientId: PAC_VALIDAR,
        alvos: [
          {
            id: alvoId,
            descricao: "Pedir objeto desejado apontando",
            nivelAjudaInicial: 2,
            procedencia: "relatado_responsavel",
          },
        ],
      });

      const resultado = await validarAnamnese(ctxCoordA, { anamneseId });
      expect(resultado.error).toBeUndefined();

      const depois = await contarGoalESnapshot(PAC_VALIDAR);
      expect(depois.goals).toBe(antes.goals + 1);
      expect(depois.snapshots).toBe(1);

      const [alvoGravado] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ goalId: schema.anamneseAlvo.goalId })
          .from(schema.anamneseAlvo)
          .where(eq(schema.anamneseAlvo.id, alvoId)),
      );
      expect(alvoGravado?.goalId).toBeTruthy();

      const [snapshotRow] = await owner<
        { repertorioState: unknown; segmentacao: unknown }[]
      >`SELECT repertorio_state AS "repertorioState", segmentacao AS "segmentacao"
        FROM session_snapshot WHERE patient_id = ${PAC_VALIDAR} AND session_numero = 0`;
      expect(snapshotRow?.repertorioState).toEqual({
        [alvoGravado!.goalId!]: {
          nivel_ajuda_recente: 2,
          contagem: 0,
          is_candidata: false,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
      });
      expect(snapshotRow?.segmentacao).toEqual({});

      const [anamneseRow] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ estado: schema.anamnese.estado })
          .from(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseId)),
      );
      expect(anamneseRow?.estado).toBe("validada");
    });

    test("alvo com marco mapeado → segmentacao no shape goal_id → protocol_id → { tipo_estrutura, metrica, rotulo }", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000010d03";
      const alvoId = "00000000-0000-0000-0000-000000010e03";
      await criarAnamneseRascunho({
        id: anamneseId,
        patientId: PAC_MILESTONE,
        alvos: [
          {
            id: alvoId,
            descricao: "Pedir item preferido usando gesto",
            milestoneId: MILESTONE_ID,
            nivelAjudaInicial: 1,
            procedencia: "observado_avaliador",
          },
        ],
      });

      const resultado = await validarAnamnese(ctxCoordA, { anamneseId });
      expect(resultado.error).toBeUndefined();

      const [alvoGravado] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ goalId: schema.anamneseAlvo.goalId })
          .from(schema.anamneseAlvo)
          .where(eq(schema.anamneseAlvo.id, alvoId)),
      );
      const goalId = alvoGravado!.goalId!;

      const [snapshotRow] = await owner<
        { segmentacao: Record<string, unknown> }[]
      >`SELECT segmentacao AS "segmentacao"
        FROM session_snapshot WHERE patient_id = ${PAC_MILESTONE} AND session_numero = 0`;
      expect(snapshotRow?.segmentacao).toEqual({
        [goalId]: {
          [PROTOCOL_ID]: {
            tipo_estrutura: "marco_simples",
            metrica: "nivel_ajuda",
            rotulo: "Pedir item preferido",
          },
        },
      });

      const [mapeamento] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select()
          .from(schema.goalMilestoneMapping)
          .where(eq(schema.goalMilestoneMapping.goalId, goalId)),
      );
      expect(mapeamento?.milestoneId).toBe(MILESTONE_ID);
    });

    test("RAISE do definer (sem protocolo ativo) reverte a transação inteira — a goal já inserida não fica órfã", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000010d02";
      const alvoId = "00000000-0000-0000-0000-000000010e02";
      await criarAnamneseRascunho({
        id: anamneseId,
        patientId: PAC_ROLLBACK,
        alvos: [
          {
            id: alvoId,
            descricao: "Seguir instrução de dois passos",
            nivelAjudaInicial: 3,
            procedencia: "registro_anterior",
          },
        ],
      });

      const antes = await contarGoalESnapshot(PAC_ROLLBACK);
      expect(antes).toEqual({ goals: 0, snapshots: 0 });

      const resultado = await validarAnamnese(ctxCoordA, { anamneseId });
      expect(resultado.error).toBeTruthy();

      const depois = await contarGoalESnapshot(PAC_ROLLBACK);
      expect(depois).toEqual({ goals: 0, snapshots: 0 });

      const [alvoGravado] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ goalId: schema.anamneseAlvo.goalId })
          .from(schema.anamneseAlvo)
          .where(eq(schema.anamneseAlvo.id, alvoId)),
      );
      expect(alvoGravado?.goalId).toBeNull();

      const [anamneseRow] = await withTenant(ctxCoordA, (tx) =>
        tx
          .select({ estado: schema.anamnese.estado })
          .from(schema.anamnese)
          .where(eq(schema.anamnese.id, anamneseId)),
      );
      expect(anamneseRow?.estado).toBe("rascunho");
    });

    test("segunda validação da mesma anamnese (via core e via definer direto) não cria goal extra", async () => {
      const anamneseId = "00000000-0000-0000-0000-000000010d04";
      const alvoId = "00000000-0000-0000-0000-000000010e04";
      const patientId = PAC_VALIDAR; // reaproveita paciente já validado no teste 1
      await criarAnamneseRascunho({
        id: anamneseId,
        patientId,
        alvos: [
          {
            id: alvoId,
            descricao: "Responder pelo nome quando chamado",
            nivelAjudaInicial: 1,
            procedencia: "observado_avaliador",
          },
        ],
      });

      const primeiro = await validarAnamnese(ctxCoordA, { anamneseId });
      expect(primeiro.error).toBeUndefined();
      const contagemAposPrimeira = await contarGoalESnapshot(patientId);

      // Segunda chamada pelo core: o WHERE `estado = 'rascunho'` já barra —
      // nenhuma goal é inserida nesta tentativa.
      const segundo = await validarAnamnese(ctxCoordA, { anamneseId });
      expect(segundo.error).toBeTruthy();
      expect(await contarGoalESnapshot(patientId)).toEqual(
        contagemAposPrimeira,
      );

      // Chamando o definer DIRETO (bypassando o guard do core) na mesma
      // anamnese, já `validada`: RAISE ANAMNESE_JA_VALIDADA, lido de
      // `err.cause` — não de `DrizzleQueryError.message` (o statement).
      expect(
        await erroDe(
          withTenant(ctxCoordA, (tx) =>
            tx.execute(
              sqlTag`SELECT app_validar_anamnese(${anamneseId}::uuid, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb)`,
            ),
          ),
        ),
      ).toMatch(/ANAMNESE_JA_VALIDADA/);

      expect(await contarGoalESnapshot(patientId)).toEqual(
        contagemAposPrimeira,
      );
    });
  },
);
