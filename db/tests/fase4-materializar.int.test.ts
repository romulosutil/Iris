/**
 * Fase 4 (4B) — materialização real (segmentação/repertório/candidatura).
 * Mesmo harness de db/tests/fase4-evidence-rls.int.test.ts.
 *
 * Cobre o DoD da spec (2026-07-13-fase-4-compute-segmentacao.md §5):
 *  - marco_simples: EVOLUÇÃO (1ª positiva + melhora) e REGRESSÃO (2 pioras
 *    consecutivas) aparecem em `session_snapshot.segmentacao`.
 *  - marco_com_barreira: rótulo SEMPRE `aguardando_avaliacao_formal` (nunca
 *    número fabricado).
 *  - `goal_candidacy` acende quando `Goal.criterio_dominio` é satisfeito.
 *  - recompute retroativo: reclassificar uma evidência antiga e recomputar a
 *    partir daquele `session_numero` NÃO reescreve o snapshot de uma sessão
 *    anterior ao ponto de recompute.
 */
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as schema from "@/db/schema";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000d1";
const U_COORD_A = "00000000-0000-0000-0000-00000000c0d1";
const U_T1_A = "00000000-0000-0000-0000-0000000071d1";
// Terapeuta da MESMA clínica, mas FORA da equipe do PAC_A1 (guard cross-team).
const U_T2_A = "00000000-0000-0000-0000-0000000072d1";
const PAC_A1 = "00000000-0000-0000-0000-00000000acd1";
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";

// Clínica B (isolamento) — paciente de outra clínica para o teste de guard.
const CLINIC_B = "00000000-0000-0000-0000-0000000000d2";
const U_COORD_B = "00000000-0000-0000-0000-00000000c0d2";
const PAC_B1 = "00000000-0000-0000-0000-00000000acd2";

const ctxCoordA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;
const ctxT1A = {
  clinicId: CLINIC_A,
  userId: U_T1_A,
  role: "terapeuta",
} as const; // on-team
const ctxT2A = {
  clinicId: CLINIC_A,
  userId: U_T2_A,
  role: "terapeuta",
} as const; // fora da equipe

let owner: ReturnType<typeof postgres>;
let withTenant: typeof import("@/db/rls").withTenant;
let appSql: typeof import("@/db/client").sql;
let materializarSnapshot: typeof import("@/lib/evidence/materializar").materializarSnapshot;
let drizzleMaterializarQueries: typeof import("@/lib/evidence/materializar").drizzleMaterializarQueries;

let PROTOCOL_ID: string;
let MARCO_SIMPLES_ID: string;
let MARCO_BARREIRA_ID: string;
let GOAL_EVOLUCAO_ID: string; // testa evolução + candidatura
let GOAL_REGRESSAO_ID: string; // testa regressão
let GOAL_BARREIRA_ID: string; // testa aguardando_avaliacao_formal

const sessionIds: Record<number, string> = {};

async function inserirSessao(numero: number) {
  const id = crypto.randomUUID();
  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
    VALUES (${id}, ${CLINIC_A}, ${PAC_A1}, ${U_T1_A}, now(), 'realizada', ${numero}, 'aba')`;
  sessionIds[numero] = id;
  return id;
}

async function inserirEvidence(opts: {
  sessionNumero: number;
  goalId: string;
  milestoneId: string | null;
  nivelAjuda: string | null;
  polaridade: "positiva" | "negativa";
}) {
  const sessId = sessionIds[opts.sessionNumero]!;
  const [ext] = await owner`INSERT INTO extraction
      (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, revisado_por)
    VALUES (${sessId}, ${CLINIC_A}, 'aprovada', 'evidencia', 'trecho de teste', 'alta',
      ${owner.json({ evidencia: { alvos: [{ goal_id: opts.goalId }] } })}, ${U_T1_A})
    RETURNING id`;
  const classificacao = {
    nivel_ajuda: opts.nivelAjuda,
    polaridade: opts.polaridade,
    alvo: { goal_id: opts.goalId },
  };
  await owner`INSERT INTO evidence
      (extraction_id, patient_id, session_id, session_numero, alvo_ordinal,
       protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
    VALUES (${ext!.id}, ${PAC_A1}, ${sessId}, ${opts.sessionNumero}, 0,
      ${PROTOCOL_ID}, ${opts.goalId}, ${opts.milestoneId}, ${owner.json(classificacao)}, ${U_T1_A})`;
}

describe.skipIf(!hasDb)(
  "Fase 4 (4B) · materializarSnapshot (segmentação real)",
  () => {
    beforeAll(async () => {
      ({ withTenant } = await import("@/db/rls"));
      ({ sql: appSql } = await import("@/db/client"));
      ({ materializarSnapshot, drizzleMaterializarQueries } =
        await import("@/lib/evidence/materializar"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

      await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
      session, extraction, evidence, evidence_revision, evidence_query,
      protocol, milestone, goal, goal_candidacy, milestone_candidacy, session_snapshot
      RESTART IDENTITY CASCADE`;

      await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
      (${PROTOCOL_FAMILIA}, 'Marcos de desenvolvimento (ABA)')
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_A}, 'Clínica A (materializar)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.mat@t.com'),
      (${U_T1_A}, 'Terapeuta 1 A', 't1.a.mat@t.com'),
      (${U_T2_A}, 'Terapeuta 2 A (fora da equipe)', 't2.a.mat@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_T1_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2_A}, ${CLINIC_A}, 'terapeuta')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_A1}, ${CLINIC_A}, 'Paciente A1 (materializar)')`;
      // Só U_T1_A entra na equipe; U_T2_A fica de fora de propósito (guard cross-team).
      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${PAC_A1}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;

      // Clínica B — paciente de OUTRA clínica, para o teste de guard multi-tenant.
      await owner`INSERT INTO clinic (id, nome, is_demo) VALUES (${CLINIC_B}, 'Clínica B (isolamento)', false)`;
      await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_B}, 'Coord B', 'coord.b.mat@t.com')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_B1}, ${CLINIC_B}, 'Paciente B1 (outra clínica)')`;

      const [protocolo] =
        await owner`INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'VB-MAPP (teste)', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal", "dica_gestual", "modelacao", "dica_fisica"])})
      RETURNING id`;
      PROTOCOL_ID = protocolo!.id as string;

      const [marcoSimples] =
        await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'mando', 'Mando nível 1', 'marco_simples', ${owner.json({})})
      RETURNING id`;
      MARCO_SIMPLES_ID = marcoSimples!.id as string;

      const [marcoBarreira] =
        await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${PROTOCOL_ID}, 'barreiras', 'Barreira comportamental', 'marco_com_barreira', ${owner.json({ escala: [0, 1, 2, 3, 4] })})
      RETURNING id`;
      MARCO_BARREIRA_ID = marcoBarreira!.id as string;

      const [goalEvolucao] =
        await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Pedir água de forma independente', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD_A})
      RETURNING id`;
      GOAL_EVOLUCAO_ID = goalEvolucao!.id as string;

      const [goalRegressao] =
        await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Nomear objetos (regressão)', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 3 })}, ${U_COORD_A})
      RETURNING id`;
      GOAL_REGRESSAO_ID = goalRegressao!.id as string;

      const [goalBarreira] =
        await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Reduzir comportamento-barreira', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 99 })}, ${U_COORD_A})
      RETURNING id`;
      GOAL_BARREIRA_ID = goalBarreira!.id as string;

      for (let n = 1; n <= 4; n++) await inserirSessao(n);

      // GOAL_EVOLUCAO: s1 dica_gestual(+) evolucao, s2 dica_verbal(+) evolucao,
      // s3 independente(+) evolucao, s4 independente(+) repete (candidatura acende: 2 últimas independentes+positivas)
      await inserirEvidence({
        sessionNumero: 1,
        goalId: GOAL_EVOLUCAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "dica_gestual",
        polaridade: "positiva",
      });
      await inserirEvidence({
        sessionNumero: 2,
        goalId: GOAL_EVOLUCAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "dica_verbal",
        polaridade: "positiva",
      });
      await inserirEvidence({
        sessionNumero: 3,
        goalId: GOAL_EVOLUCAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "independente",
        polaridade: "positiva",
      });
      await inserirEvidence({
        sessionNumero: 4,
        goalId: GOAL_EVOLUCAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "independente",
        polaridade: "positiva",
      });

      // GOAL_REGRESSAO: s1 dica_verbal(+) evolucao, s2 dica_gestual(-) piora 1x,
      // s3 modelacao(-) piora 2x consecutivas → regressão
      await inserirEvidence({
        sessionNumero: 1,
        goalId: GOAL_REGRESSAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "dica_verbal",
        polaridade: "positiva",
      });
      await inserirEvidence({
        sessionNumero: 2,
        goalId: GOAL_REGRESSAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "dica_gestual",
        polaridade: "negativa",
      });
      await inserirEvidence({
        sessionNumero: 3,
        goalId: GOAL_REGRESSAO_ID,
        milestoneId: MARCO_SIMPLES_ID,
        nivelAjuda: "modelacao",
        polaridade: "negativa",
      });

      // GOAL_BARREIRA: marco_com_barreira — nunca deve virar número
      await inserirEvidence({
        sessionNumero: 1,
        goalId: GOAL_BARREIRA_ID,
        milestoneId: MARCO_BARREIRA_ID,
        nivelAjuda: null,
        polaridade: "negativa",
      });

      await withTenant(ctxCoordA, (tx) =>
        materializarSnapshot(drizzleMaterializarQueries(tx), PAC_A1, 1),
      );
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    async function lerSnapshot(numero: number) {
      const [row] = await owner`
      SELECT repertorio_state, segmentacao FROM session_snapshot
      WHERE patient_id = ${PAC_A1} AND session_numero = ${numero}
    `;
      return row as { repertorio_state: any; segmentacao: any } | undefined;
    }

    test("marco_simples: 1ª positiva na sessão 1 é evolução", async () => {
      const snap = await lerSnapshot(1);
      const seg = snap!.segmentacao[GOAL_EVOLUCAO_ID][PROTOCOL_ID];
      expect(seg.rotulo).toBe("evolucao");
      expect(seg.tipo_estrutura).toBe("marco_simples");
    });

    test("marco_simples: melhora de ordinal em sessões seguintes continua evolução", async () => {
      const snap3 = await lerSnapshot(3);
      const seg3 = snap3!.segmentacao[GOAL_EVOLUCAO_ID][PROTOCOL_ID];
      expect(seg3.rotulo).toBe("evolucao");
      expect(seg3.metrica.ordinalRecente).toBe(0); // "independente"
    });

    test("regressão: 2 pioras consecutivas disparam rótulo regressao na sessão 3", async () => {
      const snap3 = await lerSnapshot(3);
      const seg3 = snap3!.segmentacao[GOAL_REGRESSAO_ID][PROTOCOL_ID];
      expect(seg3.rotulo).toBe("regressao");
      const snap2 = await lerSnapshot(2);
      const seg2 = snap2!.segmentacao[GOAL_REGRESSAO_ID][PROTOCOL_ID];
      expect(seg2.rotulo).not.toBe("regressao"); // só 1 piora ainda
    });

    test("marco_com_barreira NUNCA vira número — sempre aguardando_avaliacao_formal", async () => {
      const snap1 = await lerSnapshot(1);
      const segBarreira = snap1!.segmentacao[GOAL_BARREIRA_ID][PROTOCOL_ID];
      expect(segBarreira.rotulo).toBe("aguardando_avaliacao_formal");
      expect(segBarreira.metrica).toBeNull();
    });

    test("goal_candidacy acende quando criterio_dominio é satisfeito (2 sessões consecutivas independente)", async () => {
      const [row] = await owner`
      SELECT is_candidate_dominada, candidacy_since FROM goal_candidacy WHERE goal_id = ${GOAL_EVOLUCAO_ID}
    `;
      expect(row?.is_candidate_dominada).toBe(true);
      expect(row?.candidacy_since).toBeTruthy();
    });

    test("goal_candidacy NÃO acende para o goal de regressão (critério de 3 não satisfeito)", async () => {
      const [row] = await owner`
      SELECT is_candidate_dominada FROM goal_candidacy WHERE goal_id = ${GOAL_REGRESSAO_ID}
    `;
      expect(row?.is_candidate_dominada ?? false).toBe(false);
    });

    describe("isolamento multi-tenant no definer (SECURITY DEFINER bypassa RLS)", () => {
      // Drizzle embrulha o erro do Postgres ("Failed query: ..."); a mensagem do
      // RAISE EXCEPTION do guard fica em `error.cause.message`. Capturamos e
      // inspecionamos a cadeia toda.
      async function capturarErro(fn: () => Promise<unknown>): Promise<string> {
        try {
          await fn();
        } catch (e) {
          const err = e as { message?: string; cause?: { message?: string } };
          return `${err.message ?? ""} ${err.cause?.message ?? ""}`;
        }
        throw new Error("esperava exceção, mas a chamada resolveu");
      }

      test("app_aplicar_snapshot com patient de OUTRA clínica (ctx clínica A) levanta exceção e não escreve", async () => {
        const msg = await capturarErro(() =>
          withTenant(ctxCoordA, (tx) =>
            tx.execute(
              dsql`SELECT app_aplicar_snapshot(${PAC_B1}::uuid, 1, '{}'::jsonb, '{}'::jsonb)`,
            ),
          ),
        );
        expect(msg).toMatch(/isolamento multi-tenant/);

        const [row] = await owner`
        SELECT 1 FROM session_snapshot WHERE patient_id = ${PAC_B1}
      `;
        expect(row).toBeUndefined();
      });

      test("app_aplicar_candidatura com patient de OUTRA clínica (ctx clínica A) levanta exceção", async () => {
        const msg = await capturarErro(() =>
          withTenant(ctxCoordA, (tx) =>
            tx.execute(
              dsql`SELECT app_aplicar_candidatura(${PAC_B1}::uuid, NULL, NULL, true, NULL, NULL, NULL)`,
            ),
          ),
        );
        expect(msg).toMatch(/isolamento multi-tenant/);
      });

      test("app_aplicar_candidatura com goal de outro paciente levanta exceção (isolamento violado)", async () => {
        const fakeGoalId = crypto.randomUUID();
        const msg = await capturarErro(() =>
          withTenant(ctxCoordA, (tx) =>
            tx.execute(
              dsql`SELECT app_aplicar_candidatura(${PAC_A1}::uuid, NULL, ${fakeGoalId}::uuid, true, NULL, NULL, NULL)`,
            ),
          ),
        );
        expect(msg).toMatch(/isolamento violado/);
      });

      // Guard cross-team (0048): terapeuta da MESMA clínica, mas fora da equipe do
      // paciente, não pode materializar snapshot/candidatura — paridade com a
      // leitura (session_snapshot_select / milestone_candidacy_select gateiam por
      // equipe). Coordenador e terapeuta-da-equipe continuam podendo.
      test("app_aplicar_snapshot: terapeuta fora da equipe (mesma clínica) é barrado e não escreve", async () => {
        const msg = await capturarErro(() =>
          withTenant(ctxT2A, (tx) =>
            tx.execute(
              dsql`SELECT app_aplicar_snapshot(${PAC_A1}::uuid, 901, '{}'::jsonb, '{}'::jsonb)`,
            ),
          ),
        );
        expect(msg).toMatch(/autorização cross-team/);

        const [row] = await owner`
        SELECT 1 FROM session_snapshot WHERE patient_id = ${PAC_A1} AND session_numero = 901
      `;
        expect(row).toBeUndefined();
      });

      test("app_aplicar_candidatura: terapeuta fora da equipe (mesma clínica) é barrado", async () => {
        const msg = await capturarErro(() =>
          withTenant(ctxT2A, (tx) =>
            tx.execute(
              dsql`SELECT app_aplicar_candidatura(${PAC_A1}::uuid, NULL, NULL, true, NULL, NULL, NULL)`,
            ),
          ),
        );
        expect(msg).toMatch(/autorização cross-team/);
      });

      test("app_aplicar_snapshot: terapeuta DA equipe escreve normalmente (controle positivo)", async () => {
        await withTenant(ctxT1A, (tx) =>
          tx.execute(
            dsql`SELECT app_aplicar_snapshot(${PAC_A1}::uuid, 900, '{}'::jsonb, '{}'::jsonb)`,
          ),
        );
        const [row] = await owner`
        SELECT 1 FROM session_snapshot WHERE patient_id = ${PAC_A1} AND session_numero = 900
      `;
        expect(row).toBeDefined();
        await owner`DELETE FROM session_snapshot WHERE patient_id = ${PAC_A1} AND session_numero = 900`;
      });
    });

    describe("recompute retroativo", () => {
      test("reclassificar evidência da sessão 2 e recomputar DESDE 2 não reescreve o snapshot da sessão 1", async () => {
        const snap1Antes = await lerSnapshot(1);

        // reclassifica a evidência de GOAL_REGRESSAO na sessão 2: nível de ajuda
        // muda de dica_gestual para dica_verbal (menos pior) via evidence_revision.
        const [ev] = await owner`
        SELECT id, classificacao_original FROM evidence
        WHERE patient_id = ${PAC_A1} AND goal_id = ${GOAL_REGRESSAO_ID} AND session_numero = 2
      `;
        const novaClassificacao = {
          ...(ev!.classificacao_original as object),
          nivel_ajuda: "dica_verbal",
        };
        await owner`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
        VALUES (${ev!.id}, 'reclassificar', ${owner.json(ev!.classificacao_original)}, ${owner.json(novaClassificacao)}, 'ajuste de teste', ${U_COORD_A})`;

        await withTenant(ctxCoordA, (tx) =>
          materializarSnapshot(drizzleMaterializarQueries(tx), PAC_A1, 2),
        );

        const snap1Depois = await lerSnapshot(1);
        expect(snap1Depois!.segmentacao).toEqual(snap1Antes!.segmentacao);
        expect(snap1Depois!.repertorio_state).toEqual(
          snap1Antes!.repertorio_state,
        );

        // sessão 2 em diante reflete a reclassificação: agora dica_verbal (ordinal 1)
        // não é pior que o ordinal 1 da sessão 1 → deixa de contar como piora,
        // então a sessão 3 (modelacao=3, negativa) some sozinha como 1ª piora, não regressão.
        const snap3Depois = await lerSnapshot(3);
        const seg3 = snap3Depois!.segmentacao[GOAL_REGRESSAO_ID][PROTOCOL_ID];
        expect(seg3.rotulo).not.toBe("regressao");
      });

      test("reclassificar o ALVO (goal A → goal B) move a evidência de stream no recompute", async () => {
        const [goalA] =
          await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
        VALUES (${PAC_A1}, ${CLINIC_A}, 'Goal A (teste move-de-stream)', 'ativa',
          ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 99 })}, ${U_COORD_A})
        RETURNING id`;
        const [goalB] =
          await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
        VALUES (${PAC_A1}, ${CLINIC_A}, 'Goal B (teste move-de-stream)', 'ativa',
          ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 99 })}, ${U_COORD_A})
        RETURNING id`;
        const GOAL_A = goalA!.id as string;
        const GOAL_B = goalB!.id as string;

        await inserirEvidence({
          sessionNumero: 4,
          goalId: GOAL_A,
          milestoneId: MARCO_SIMPLES_ID,
          nivelAjuda: "independente",
          polaridade: "positiva",
        });
        const [ev] = await owner`
        SELECT id, classificacao_original FROM evidence
        WHERE patient_id = ${PAC_A1} AND goal_id = ${GOAL_A} AND session_numero = 4
      `;
        const classificacaoNova = {
          ...(ev!.classificacao_original as object),
          alvo_resolvido: {
            goal_id: GOAL_B,
            protocol_id: PROTOCOL_ID,
            milestone_id: MARCO_SIMPLES_ID,
          },
        };
        await owner`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
        VALUES (${ev!.id}, 'reclassificar', ${owner.json(ev!.classificacao_original)}, ${owner.json(classificacaoNova)}, 'corrige alvo', ${U_COORD_A})`;

        await withTenant(ctxCoordA, (tx) =>
          materializarSnapshot(drizzleMaterializarQueries(tx), PAC_A1, 4),
        );

        const snap4 = await lerSnapshot(4);
        expect(snap4!.segmentacao[GOAL_B]).toBeDefined();
        expect(snap4!.segmentacao[GOAL_B][PROTOCOL_ID]).toBeDefined();
        expect(snap4!.segmentacao[GOAL_A]).toBeUndefined();
        expect(snap4!.repertorio_state[GOAL_B]).toBeDefined();
        expect(snap4!.repertorio_state[GOAL_A]).toBeUndefined();
      });
    });

    describe("oráculo de contagem de queries (#316, #330 — os N+1 têm que ficar mortos)", () => {
      // Hook `debug` do postgres.js: chamado 1x por query de fato enviada ao
      // Postgres (não por linha de resultado). A fixture de beforeAll tem múltiplos
      // marcos, protocolos e goals — se qualquer busca voltasse a ser N+1 (sequencial
      // OU `Promise.all`), este teste contaria >= 2, nunca 1 por tabela.
      test("tipo_estrutura por marco é 1 query em lote — nunca N", async () => {
        let queriesNaMilestone = 0;
        const countingSql = postgres(process.env.DATABASE_URL!, {
          max: 1,
          debug: (_connId, query) => {
            // Drizzle quota identificadores (`from "milestone"`), então casa só
            // no nome da tabela — \b evita colidir com `milestone_candidacy`
            // (sem fronteira de palavra entre "e" e "_").
            if (/\bmilestone\b/i.test(query)) queriesNaMilestone++;
          },
        });
        try {
          const countingDb = drizzle(countingSql, {
            schema,
            casing: "snake_case",
          });
          await countingDb.transaction(async (tx) => {
            await tx.execute(dsql`select
              set_config('app.clinic_id', ${CLINIC_A}, true),
              set_config('app.user_id', ${U_COORD_A}, true),
              set_config('app.user_role', 'coordenador', true)`);
            await materializarSnapshot(
              drizzleMaterializarQueries(tx),
              PAC_A1,
              1,
            );
          });
        } finally {
          await countingSql.end();
        }
        expect(queriesNaMilestone).toBe(1);
      });

      test("taxonomia por protocolo é 1 query em lote (#330) — nunca N", async () => {
        let queriesNoProtocol = 0;
        const countingSql = postgres(process.env.DATABASE_URL!, {
          max: 1,
          debug: (_connId, query) => {
            if (/\bprotocol\b/i.test(query)) queriesNoProtocol++;
          },
        });
        try {
          const countingDb = drizzle(countingSql, {
            schema,
            casing: "snake_case",
          });
          await countingDb.transaction(async (tx) => {
            await tx.execute(dsql`select
              set_config('app.clinic_id', ${CLINIC_A}, true),
              set_config('app.user_id', ${U_COORD_A}, true),
              set_config('app.user_role', 'coordenador', true)`);
            await materializarSnapshot(
              drizzleMaterializarQueries(tx),
              PAC_A1,
              1,
            );
          });
        } finally {
          await countingSql.end();
        }
        expect(queriesNoProtocol).toBe(1);
      });

      test("criterios de dominio por goal é 1 query em lote (#330) — nunca N", async () => {
        let queriesNoGoal = 0;
        const countingSql = postgres(process.env.DATABASE_URL!, {
          max: 1,
          debug: (_connId, query) => {
            if (/\bgoal\b/i.test(query)) queriesNoGoal++;
          },
        });
        try {
          const countingDb = drizzle(countingSql, {
            schema,
            casing: "snake_case",
          });
          await countingDb.transaction(async (tx) => {
            await tx.execute(dsql`select
              set_config('app.clinic_id', ${CLINIC_A}, true),
              set_config('app.user_id', ${U_COORD_A}, true),
              set_config('app.user_role', 'coordenador', true)`);
            await materializarSnapshot(
              drizzleMaterializarQueries(tx),
              PAC_A1,
              1,
            );
          });
        } finally {
          await countingSql.end();
        }
        expect(queriesNoGoal).toBe(1);
      });

      test("leitura de goal_candidacy atual é 1 query em lote (#330) — nunca N", async () => {
        let queriesNoGoalCandidacySelect = 0;
        const countingSql = postgres(process.env.DATABASE_URL!, {
          max: 1,
          debug: (_connId, query) => {
            if (/select\b.*\bgoal_candidacy\b/i.test(query))
              queriesNoGoalCandidacySelect++;
          },
        });
        try {
          const countingDb = drizzle(countingSql, {
            schema,
            casing: "snake_case",
          });
          await countingDb.transaction(async (tx) => {
            await tx.execute(dsql`select
              set_config('app.clinic_id', ${CLINIC_A}, true),
              set_config('app.user_id', ${U_COORD_A}, true),
              set_config('app.user_role', 'coordenador', true)`);
            await materializarSnapshot(
              drizzleMaterializarQueries(tx),
              PAC_A1,
              1,
            );
          });
        } finally {
          await countingSql.end();
        }
        expect(queriesNoGoalCandidacySelect).toBe(1);
      });

      test("listas vazias não vão ao banco — 0 queries, Maps vazios", async () => {
        let queries = 0;
        const countingSql = postgres(process.env.DATABASE_URL!, {
          max: 1,
          debug: () => {
            queries++;
          },
        });
        try {
          const countingDb = drizzle(countingSql, {
            schema,
            casing: "snake_case",
          });
          await countingDb.transaction(async (tx) => {
            await tx.execute(dsql`select
              set_config('app.clinic_id', ${CLINIC_A}, true),
              set_config('app.user_id', ${U_COORD_A}, true),
              set_config('app.user_role', 'coordenador', true)`);
            queries = 0; // zera contagem após set_config

            const dQueries = drizzleMaterializarQueries(tx);
            const mMarcos = await dQueries.tiposEstruturaDosMarcos([]);
            const mProto = await dQueries.taxonomiasDosProtocolos([]);
            const mMetas = await dQueries.criteriosDominioDasMetas([]);
            const mCand = await dQueries.lerCandidaturasGoalsAtuais([]);

            expect(mMarcos.size).toBe(0);
            expect(mProto.size).toBe(0);
            expect(mMetas.size).toBe(0);
            expect(mCand.size).toBe(0);
          });
        } finally {
          await countingSql.end();
        }
        expect(queries).toBe(0);
      });
    });

    describe("contrato de `tiposEstruturaDosMarcos` (query em lote, #316)", () => {
      const NAO_EXISTE = "00000000-0000-0000-0000-0000000000ff";

      test("remapeia por CHAVE, não por ordem — com duplicata e id inexistente na entrada", async () => {
        const mapa = await withTenant(ctxCoordA, (tx) =>
          drizzleMaterializarQueries(tx).tiposEstruturaDosMarcos([
            NAO_EXISTE,
            MARCO_BARREIRA_ID,
            MARCO_SIMPLES_ID,
            MARCO_SIMPLES_ID,
          ]),
        );

        expect(mapa.get(MARCO_BARREIRA_ID)).toBe("marco_com_barreira");
        expect(mapa.get(MARCO_SIMPLES_ID)).toBe("marco_simples");
        expect(mapa.has(NAO_EXISTE)).toBe(false);
        expect(mapa.size).toBe(2);
      });

      test("continua sob RLS — tenant B não enxerga marco da clínica A", async () => {
        const ctxCoordB = {
          clinicId: CLINIC_B,
          userId: U_COORD_B,
          role: "coordenador",
        } as const;
        const mapa = await withTenant(ctxCoordB, (tx) =>
          drizzleMaterializarQueries(tx).tiposEstruturaDosMarcos([
            MARCO_SIMPLES_ID,
            MARCO_BARREIRA_ID,
          ]),
        );
        expect(mapa.size).toBe(0);
      });

      test("adapter `postgres.Sql` (owner/backfill) binda o array em conexão FRIA", async () => {
        const { postgresMaterializarQueries } =
          await import("@/lib/evidence/materializar");
        const fria = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
        try {
          const mapa = await postgresMaterializarQueries(
            fria,
          ).tiposEstruturaDosMarcos([
            NAO_EXISTE,
            MARCO_BARREIRA_ID,
            MARCO_SIMPLES_ID,
            MARCO_SIMPLES_ID,
          ]);
          expect(mapa.get(MARCO_BARREIRA_ID)).toBe("marco_com_barreira");
          expect(mapa.get(MARCO_SIMPLES_ID)).toBe("marco_simples");
          expect(mapa.has(NAO_EXISTE)).toBe(false);
          expect(mapa.size).toBe(2);
          expect(
            (
              await postgresMaterializarQueries(fria).tiposEstruturaDosMarcos(
                [],
              )
            ).size,
          ).toBe(0);
        } finally {
          await fria.end();
        }
      });
    });

    describe("contrato de `taxonomiasDosProtocolos` (query em lote, #330)", () => {
      const NAO_EXISTE = "00000000-0000-0000-0000-0000000000ff";

      test("remapeia por CHAVE com duplicata e id inexistente na entrada", async () => {
        const mapa = await withTenant(ctxCoordA, (tx) =>
          drizzleMaterializarQueries(tx).taxonomiasDosProtocolos([
            NAO_EXISTE,
            PROTOCOL_ID,
            PROTOCOL_ID,
          ]),
        );

        expect(mapa.get(PROTOCOL_ID)).toEqual([
          "independente",
          "dica_verbal",
          "dica_gestual",
          "modelacao",
          "dica_fisica",
        ]);
        expect(mapa.has(NAO_EXISTE)).toBe(false);
        expect(mapa.size).toBe(1);
      });

      test("continua sob RLS — tenant B não enxerga protocolo da clínica A", async () => {
        const ctxCoordB = {
          clinicId: CLINIC_B,
          userId: U_COORD_B,
          role: "coordenador",
        } as const;
        const mapa = await withTenant(ctxCoordB, (tx) =>
          drizzleMaterializarQueries(tx).taxonomiasDosProtocolos([PROTOCOL_ID]),
        );
        expect(mapa.size).toBe(0);
      });

      test("adapter `postgres.Sql` (owner/backfill) binda o array em conexão FRIA", async () => {
        const { postgresMaterializarQueries } =
          await import("@/lib/evidence/materializar");
        const fria = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
        try {
          const mapa = await postgresMaterializarQueries(
            fria,
          ).taxonomiasDosProtocolos([NAO_EXISTE, PROTOCOL_ID, PROTOCOL_ID]);
          expect(mapa.get(PROTOCOL_ID)).toEqual([
            "independente",
            "dica_verbal",
            "dica_gestual",
            "modelacao",
            "dica_fisica",
          ]);
          expect(mapa.has(NAO_EXISTE)).toBe(false);
          expect(mapa.size).toBe(1);
          expect(
            (
              await postgresMaterializarQueries(fria).taxonomiasDosProtocolos(
                [],
              )
            ).size,
          ).toBe(0);
        } finally {
          await fria.end();
        }
      });
    });

    describe("contrato de `criteriosDominioDasMetas` (query em lote, #330)", () => {
      const NAO_EXISTE = "00000000-0000-0000-0000-0000000000ff";

      test("remapeia por CHAVE com duplicata e id inexistente na entrada", async () => {
        const mapa = await withTenant(ctxCoordA, (tx) =>
          drizzleMaterializarQueries(tx).criteriosDominioDasMetas([
            NAO_EXISTE,
            GOAL_EVOLUCAO_ID,
            GOAL_REGRESSAO_ID,
            GOAL_EVOLUCAO_ID,
          ]),
        );

        expect(mapa.get(GOAL_EVOLUCAO_ID)).toEqual({
          tipo: "sessoes_consecutivas_independente",
          valor: 2,
        });
        expect(mapa.get(GOAL_REGRESSAO_ID)).toEqual({
          tipo: "sessoes_consecutivas_independente",
          valor: 3,
        });
        expect(mapa.has(NAO_EXISTE)).toBe(false);
        expect(mapa.size).toBe(2);
      });

      test("continua sob RLS — tenant B não enxerga meta da clínica A", async () => {
        const ctxCoordB = {
          clinicId: CLINIC_B,
          userId: U_COORD_B,
          role: "coordenador",
        } as const;
        const mapa = await withTenant(ctxCoordB, (tx) =>
          drizzleMaterializarQueries(tx).criteriosDominioDasMetas([
            GOAL_EVOLUCAO_ID,
          ]),
        );
        expect(mapa.size).toBe(0);
      });

      test("adapter `postgres.Sql` (owner/backfill) binda o array em conexão FRIA", async () => {
        const { postgresMaterializarQueries } =
          await import("@/lib/evidence/materializar");
        const fria = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
        try {
          const mapa = await postgresMaterializarQueries(
            fria,
          ).criteriosDominioDasMetas([
            NAO_EXISTE,
            GOAL_EVOLUCAO_ID,
            GOAL_REGRESSAO_ID,
          ]);
          expect(mapa.get(GOAL_EVOLUCAO_ID)).toEqual({
            tipo: "sessoes_consecutivas_independente",
            valor: 2,
          });
          expect(mapa.has(NAO_EXISTE)).toBe(false);
          expect(mapa.size).toBe(2);
          expect(
            (
              await postgresMaterializarQueries(fria).criteriosDominioDasMetas(
                [],
              )
            ).size,
          ).toBe(0);
        } finally {
          await fria.end();
        }
      });
    });

    describe("contrato de `lerCandidaturasGoalsAtuais` (query em lote, #330)", () => {
      const NAO_EXISTE = "00000000-0000-0000-0000-0000000000ff";

      test("remapeia por CHAVE com duplicata e id inexistente na entrada", async () => {
        const mapa = await withTenant(ctxCoordA, (tx) =>
          drizzleMaterializarQueries(tx).lerCandidaturasGoalsAtuais([
            NAO_EXISTE,
            GOAL_EVOLUCAO_ID,
            GOAL_REGRESSAO_ID,
            GOAL_EVOLUCAO_ID,
          ]),
        );

        expect(mapa.get(GOAL_EVOLUCAO_ID)?.isCandidate).toBe(true);
        expect(mapa.get(GOAL_REGRESSAO_ID)?.isCandidate).toBe(false);
        expect(mapa.has(NAO_EXISTE)).toBe(false);
        expect(mapa.size).toBe(2);
      });

      test("continua sob RLS — tenant B não enxerga candidatura da clínica A", async () => {
        const ctxCoordB = {
          clinicId: CLINIC_B,
          userId: U_COORD_B,
          role: "coordenador",
        } as const;
        const mapa = await withTenant(ctxCoordB, (tx) =>
          drizzleMaterializarQueries(tx).lerCandidaturasGoalsAtuais([
            GOAL_EVOLUCAO_ID,
          ]),
        );
        expect(mapa.size).toBe(0);
      });

      test("adapter `postgres.Sql` (owner/backfill) binda o array em conexão FRIA", async () => {
        const { postgresMaterializarQueries } =
          await import("@/lib/evidence/materializar");
        const fria = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
        try {
          const mapa = await postgresMaterializarQueries(
            fria,
          ).lerCandidaturasGoalsAtuais([
            NAO_EXISTE,
            GOAL_EVOLUCAO_ID,
            GOAL_REGRESSAO_ID,
          ]);
          expect(mapa.get(GOAL_EVOLUCAO_ID)?.isCandidate).toBe(true);
          expect(mapa.get(GOAL_REGRESSAO_ID)?.isCandidate).toBe(false);
          expect(mapa.has(NAO_EXISTE)).toBe(false);
          expect(mapa.size).toBe(2);
          expect(
            (
              await postgresMaterializarQueries(
                fria,
              ).lerCandidaturasGoalsAtuais([])
            ).size,
          ).toBe(0);
        } finally {
          await fria.end();
        }
      });
    });

    test("paciente com marco 0 materializa a sessão 1 normalmente (ANAM-13 / T24)", async () => {
      const pacComMarcoZero = "00000000-0000-0000-0000-0000000000d9";
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${pacComMarcoZero}, ${CLINIC_A}, 'Paciente Marco Zero Mat')`;
      await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
        VALUES (${pacComMarcoZero}, ${U_T1_A}, 'ABA', 'terapeuta_referencia')`;
      await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
        VALUES (${pacComMarcoZero}, ${PROTOCOL_ID}, ${U_COORD_A})`;

      const [goalMz] =
        await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${pacComMarcoZero}, ${CLINIC_A}, 'Meta de Anamnese', 'ativa',
        ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD_A})
      RETURNING id`;
      const goalMzId = goalMz!.id as string;

      await owner`INSERT INTO goal_milestone_mapping (goal_id, milestone_id)
        VALUES (${goalMzId}, ${MARCO_SIMPLES_ID})`;

      // Snapshot 0 (Anamnese)
      await owner`INSERT INTO session_snapshot (patient_id, session_numero, repertorio_state, segmentacao) VALUES
        (${pacComMarcoZero}, 0,
          ${owner.json({ [MARCO_SIMPLES_ID]: { nivel_ajuda_recente: 3, contagem: 0, is_candidata: false, origem: "anamnese", procedencia: "relatado_responsavel" } })},
          ${owner.json({ [goalMzId]: { [PROTOCOL_ID]: { tipo_estrutura: "marco_simples", metrica: { eixo: "nivel_ajuda", ordinalRecente: 3 }, rotulo: "estavel" } } })}
        )`;

      // Sessão 1
      const sessMzId = crypto.randomUUID();
      await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina)
        VALUES (${sessMzId}, ${CLINIC_A}, ${pacComMarcoZero}, ${U_T1_A}, now(), 'realizada', 1, 'aba')`;

      const [extMz] = await owner`INSERT INTO extraction
        (session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload, revisado_por)
        VALUES (${sessMzId}, ${CLINIC_A}, 'aprovada', 'evidencia', 'trecho mz', 'alta',
          ${owner.json({ evidencia: { alvos: [{ goal_id: goalMzId }] } })}, ${U_T1_A})
        RETURNING id`;

      await owner`INSERT INTO evidence
        (extraction_id, patient_id, session_id, session_numero, alvo_ordinal,
         protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por)
        VALUES (${extMz!.id}, ${pacComMarcoZero}, ${sessMzId}, 1, 0,
          ${PROTOCOL_ID}, ${goalMzId}, ${MARCO_SIMPLES_ID},
          ${owner.json({ nivel_ajuda: "dica_gestual", polaridade: "positiva", alvo: { goal_id: goalMzId } })}, ${U_T1_A})`;

      // Materializar Sessão 1
      await withTenant(ctxCoordA, (tx) =>
        materializarSnapshot(
          drizzleMaterializarQueries(tx),
          pacComMarcoZero,
          1,
        ),
      );

      // Snapshot 0 permanece intacto
      const [snap0] = await owner`
        SELECT repertorio_state, segmentacao FROM session_snapshot
        WHERE patient_id = ${pacComMarcoZero} AND session_numero = 0
      `;
      expect(snap0).toBeTruthy();
      expect(snap0!.repertorio_state[MARCO_SIMPLES_ID].origem).toBe("anamnese");

      // Snapshot 1 materializado com sucesso
      const [snap1] = await owner`
        SELECT repertorio_state, segmentacao FROM session_snapshot
        WHERE patient_id = ${pacComMarcoZero} AND session_numero = 1
      `;
      expect(snap1).toBeTruthy();
      expect(snap1!.segmentacao[goalMzId][PROTOCOL_ID].rotulo).toBe("evolucao");
    });
  },
);
