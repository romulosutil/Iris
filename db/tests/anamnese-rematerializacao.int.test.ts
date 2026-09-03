/**
 * #407 T21 e T22 — guarda de rematerialização e tolerância a chave órfã.
 *
 * T21 (ANAM-13): o snapshot 0 sobrevive à rematerialização de sessões comuns.
 * Prova que números a materializar derivam exclusivamente de evidências (que
 * sempre têm session_numero >= 1), garantindo que snapshot 0 nunca é sobrescrito.
 *
 * T22 (ANAM-18): quando uma meta de anamnese é excluída, `anamnese_alvo.goal_id`
 * vira NULL (on delete set null) e o hexágono de repertório ignora a chave órfã
 * sem estourar erro, recalculando o espectro normalmente.
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000021fa";
const U_COORD_A = "00000000-0000-0000-0000-00000000219a";
const U_T1_A = "00000000-0000-0000-0000-00000000217a";
const PAC_T21 = "00000000-0000-0000-0000-000000021a01";
const PAC_T22 = "00000000-0000-0000-0000-000000021a02";

const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let schema: typeof import("@/db/schema");
let validarAnamnese: typeof import("@/app/(app)/pacientes/[id]/anamnese/logic").validarAnamnese;
let materializarSnapshot: typeof import("@/lib/evidence/materializar").materializarSnapshot;
let drizzleMaterializarQueries: typeof import("@/lib/evidence/materializar").drizzleMaterializarQueries;
let carregarTimeline: typeof import("@/app/(app)/pacientes/[id]/timeline/queries").carregarTimeline;

let PROTOCOL_ID: string;
let MILESTONE_ID: string;

describe.skipIf(!hasDb)(
  "T21/T22 · Anamnese Rematerialização e Chave Órfã",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      schema = await import("@/db/schema");
      ({ validarAnamnese } =
        await import("@/app/(app)/pacientes/[id]/anamnese/logic"));
      ({ materializarSnapshot, drizzleMaterializarQueries } =
        await import("@/lib/evidence/materializar"));
      ({ carregarTimeline } =
        await import("@/app/(app)/pacientes/[id]/timeline/queries"));

      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`INSERT INTO protocol_familia_catalogo (id, nome)
      VALUES (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINIC_A}, 'Clínica A (T21/T22)', false)
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord T21', 'coord.t21@iris.com'),
      (${U_T1_A}, 'Terapeuta T21', 't1.t21@iris.com')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta')
      ON CONFLICT DO NOTHING`;

      await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality) VALUES
      (${PAC_T21}, ${CLINIC_A}, 'Paciente T21 Remat', 'protocol_driven'),
      (${PAC_T22}, ${CLINIC_A}, 'Paciente T22 Orfa', 'protocol_driven')
      ON CONFLICT (id) DO NOTHING`;

      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC_T21}, ${U_T1_A}, 'ABA', 'terapeuta_referencia'),
      (${PAC_T22}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')
      ON CONFLICT DO NOTHING`;

      const [proto] = await owner`INSERT INTO protocol
      (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'Protocolo T21', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
      PROTOCOL_ID = proto!.id as string;

      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
      (${PAC_T21}, ${PROTOCOL_ID}, ${U_COORD_A}),
      (${PAC_T22}, ${PROTOCOL_ID}, ${U_COORD_A})`;

      const [marco] = await owner`INSERT INTO milestone
      (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando T21', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      MILESTONE_ID = marco!.id as string;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("T21 (ANAM-13): snapshot 0 sobrevive à rematerialização de sessões comuns", async () => {
      // 1. Cria e valida a anamnese para PAC_T21
      const anamneseId = crypto.randomUUID();
      const alvoId = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
      VALUES (${anamneseId}, ${CLINIC_A}, ${PAC_T21}, 'rascunho', ${U_COORD_A})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvoId}, ${anamneseId}, ${CLINIC_A}, ${PAC_T21},
        'comunicacao_expressiva', 'Pedir ajuda na anamnese', ${MILESTONE_ID}, 3, 'relatado_responsavel')`;

      const valRes = await withTenant(ctxCoordA, (tx) =>
        validarAnamnese(ctxCoordA, { anamneseId }),
      );
      expect(valRes.id).toBe(anamneseId);

      // 2. Lê snapshot 0 e guarda estado exato e geradoEm
      const [snap0Antes] = await owner`
      SELECT session_numero, repertorio_state, segmentacao, gerado_em
      FROM session_snapshot
      WHERE patient_id = ${PAC_T21} AND session_numero = 0
    `;
      expect(snap0Antes).toBeTruthy();
      expect(snap0Antes!.session_numero).toBe(0);

      const [alvoRow] = await owner`
      SELECT goal_id FROM anamnese_alvo WHERE id = ${alvoId}
    `;
      const goalId = alvoRow!.goal_id as string;

      // 3. Insere Sessão 1 com evidência
      const sess1Id = crypto.randomUUID();
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
      VALUES (${sess1Id}, ${CLINIC_A}, ${PAC_T21}, ${U_T1_A}, now(), 'realizada', 1, 'aba')`;

      const [ext1] = await owner`INSERT INTO extraction
      (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, revisado_por)
      VALUES (${sess1Id}, ${CLINIC_A}, 'aprovada', 'evidencia', 'trecho s1', 'alta',
        ${owner.json({ alvos: [{ goal_id: goalId }] })}, ${U_T1_A})
      RETURNING id`;

      await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal,
       protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
      VALUES (${ext1!.id}, ${PAC_T21}, ${sess1Id}, 1, 0,
        ${PROTOCOL_ID}, ${goalId}, ${MILESTONE_ID},
        ${owner.json({ nivel_ajuda: "dica_verbal", polaridade: "positiva", alvo: { goal_id: goalId } })}, ${U_T1_A})`;

      // 4. Executa rematerialização da Sessão 1
      await withTenant(ctxCoordA, (tx) =>
        materializarSnapshot(drizzleMaterializarQueries(tx), PAC_T21, 1),
      );

      // 5. Prova que a sessão 1 foi de fato materializada
      const [snap1] = await owner`
      SELECT session_numero, repertorio_state, segmentacao
      FROM session_snapshot
      WHERE patient_id = ${PAC_T21} AND session_numero = 1
    `;
      expect(snap1).toBeTruthy();
      expect(snap1!.session_numero).toBe(1);

      // 6. Prova que o snapshot 0 continuou BYTE-IDÊNTICO (ANAM-13)
      const [snap0Depois] = await owner`
      SELECT session_numero, repertorio_state, segmentacao, gerado_em
      FROM session_snapshot
      WHERE patient_id = ${PAC_T21} AND session_numero = 0
    `;
      expect(snap0Depois).toEqual(snap0Antes);
      expect(snap0Depois!.gerado_em).toEqual(snap0Antes!.gerado_em);
    });

    test("T22 (ANAM-18): exclusão de meta gerada pela anamnese deixa FK null e timeline ignora chave órfã", async () => {
      // 1. Cria e valida anamnese para PAC_T22
      const anamneseId = crypto.randomUUID();
      const alvoId = crypto.randomUUID();
      await owner`INSERT INTO anamnese (id, clinic_id, patient_id, estado, criado_por)
      VALUES (${anamneseId}, ${CLINIC_A}, ${PAC_T22}, 'rascunho', ${U_COORD_A})`;
      await owner`INSERT INTO anamnese_alvo
      (id, anamnese_id, clinic_id, patient_id, eixo, descricao, milestone_id, nivel_ajuda_inicial, procedencia)
      VALUES (${alvoId}, ${anamneseId}, ${CLINIC_A}, ${PAC_T22},
        'comunicacao_expressiva', 'Alvo a ser deletado', ${MILESTONE_ID}, 2, 'observado_avaliador')`;

      await withTenant(ctxCoordA, (tx) =>
        validarAnamnese(ctxCoordA, { anamneseId }),
      );

      const [alvoRow] = await owner`
      SELECT goal_id FROM anamnese_alvo WHERE id = ${alvoId}
    `;
      const goalId = alvoRow!.goal_id as string;
      expect(goalId).toBeTruthy();

      // 2. Exclui a meta (simulando descarte administrativo ou exclusão de meta)
      await owner`DELETE FROM goal WHERE id = ${goalId}`;

      // 3. Assertar que `anamnese_alvo.goal_id` virou NULL (on delete set null)
      const [alvoDepois] = await owner`
      SELECT goal_id, descricao FROM anamnese_alvo WHERE id = ${alvoId}
    `;
      expect(alvoDepois!.goal_id).toBeNull();
      expect(alvoDepois!.descricao).toBe("Alvo a ser deletado");

      // 4. Carrega a timeline: não quebra e ignora a meta excluída
      const timeline = await carregarTimeline(ctxCoordA, PAC_T22);
      expect(timeline).toBeTruthy();
      expect(timeline!.snapshots.length).toBeGreaterThanOrEqual(1);

      // O snapshot 0 continua legível e com eixos computados
      const snap0 = timeline!.snapshots.find((s) => s.sessionNumero === 0);
      expect(snap0).toBeTruthy();
      expect(snap0!.espectro.eixos).toHaveLength(6);
    });
  },
);
