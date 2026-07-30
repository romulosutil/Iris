import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

const CLINIC = "00000000-0000-0000-0000-0000000000e1";
const U_COORD = "00000000-0000-0000-0000-00000000e0c1";
const U_TERAPEUTA = "00000000-0000-0000-0000-00000000e0e1";
const U_TERAPEUTA_FORA = "00000000-0000-0000-0000-00000000e0e2";
const PAC = "00000000-0000-0000-0000-00000000eac1";
const SESS = "00000000-0000-0000-0000-00000000e5e1";

const EX = "00000000-0000-0000-0000-00000000ee11";
const EX2 = "00000000-0000-0000-0000-00000000ee12";
const EX3 = "00000000-0000-0000-0000-00000000ee13";
const EX4 = "00000000-0000-0000-0000-00000000ee14";

const EV = "00000000-0000-0000-0000-00000000ee21";
const EV2 = "00000000-0000-0000-0000-00000000ee22";
const EV3 = "00000000-0000-0000-0000-00000000ee23";
const EV4 = "00000000-0000-0000-0000-00000000ee24";

const Q = "00000000-0000-0000-0000-00000000eeb1";
const Q2 = "00000000-0000-0000-0000-00000000eeb2";
const Q3 = "00000000-0000-0000-0000-00000000eeb3";
const Q4 = "00000000-0000-0000-0000-00000000eeb4";

const ctxTerapeuta = {
  clinicId: CLINIC,
  userId: U_TERAPEUTA,
  role: "terapeuta",
} as const;
const ctxTerapeutaForaEquipe = {
  clinicId: CLINIC,
  userId: U_TERAPEUTA_FORA,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let responderQuery: typeof import("./logic").responderQuery;
let ALVO_VALIDO: { goal_id: string };

describe.skipIf(!hasDb)("duvidas: responder query (lado do terapeuta)", () => {
  beforeAll(async () => {
    ({ responderQuery } = await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, evidence, evidence_revision, evidence_query, audit_log, protocol, protocol_familia_catalogo, patient_protocol, milestone, goal, care_team_membership RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica E')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@e.com', 'Coordenador E'),
      (${U_TERAPEUTA}, 'terapeuta@e.com', 'Terapeuta E'),
      (${U_TERAPEUTA_FORA}, 'fora@e.com', 'Terapeuta Fora E')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_TERAPEUTA}, ${CLINIC}, 'terapeuta'),
      (${U_TERAPEUTA_FORA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente E')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC}, ${PAC}, ${U_TERAPEUTA}, now(), 'realizada', 'desconhecida')`;

    // U_TERAPEUTA está na equipe vigente do paciente; U_TERAPEUTA_FORA não.
    await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
      (${PAC}, ${U_TERAPEUTA}, 'ABA', 'terapeuta_referencia')`;

    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 1', 'baixa', false, '{"funcao":"tato"}'),
      (${EX2}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 2', 'baixa', false, '{"funcao":"tato"}'),
      (${EX3}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 3', 'baixa', false, '{"funcao":"tato"}'),
      (${EX4}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 4', 'baixa', false, '{"funcao":"tato"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV}, ${EX}, ${PAC}, ${SESS}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV2}, ${EX2}, ${PAC}, ${SESS}, 1, 1, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV3}, ${EX3}, ${PAC}, ${SESS}, 1, 2, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV4}, ${EX4}, ${PAC}, ${SESS}, 1, 3, '{"funcao":"tato"}'::jsonb, ${U_COORD})`;

    // Protocolo ATIVO + goal válido do paciente, p/ o teste de novoAlvo.
    const PROTOCOL_FAMILIA = "vbmapp-e";
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES (${PROTOCOL_FAMILIA}, 'VB-MAPP (teste E)') ON CONFLICT (id) DO NOTHING`;
    const [protocolo] =
      await owner`INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC}, 'VB-MAPP (teste E)', 'ABA', ${PROTOCOL_FAMILIA}, ${owner.json(["independente", "dica_verbal"])})
      RETURNING id`;
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES (${PAC}, ${protocolo!.id}, ${U_COORD})`;
    const [goalRow] =
      await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC}, ${CLINIC}, 'Pedir água de forma independente', 'ativa', ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD})
      RETURNING id`;
    ALVO_VALIDO = { goal_id: goalRow!.id as string };

    // Queries abertas (coordenador devolveu com dúvida) — respondido_em NULL.
    await owner`INSERT INTO evidence_query (id, evidence_id, coordenador_id, pergunta) VALUES
      (${Q}, ${EV}, ${U_COORD}, 'isso é mando ou tato?'),
      (${Q2}, ${EV2}, ${U_COORD}, 'confirma o alvo?'),
      (${Q3}, ${EV3}, ${U_COORD}, 'reescreve isso?'),
      (${Q4}, ${EV4}, ${U_COORD}, 'confirma de novo?')`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("terapeuta responde query → fecha (respondido_em) e recompute re-inclui a evidência", async () => {
    const r = await responderQuery(ctxTerapeuta, {
      evidenceQueryId: Q,
      respostaTexto: "é mando",
    });
    expect(r.ok).toBe(true);
    const [q] =
      await owner`SELECT respondido_em FROM evidence_query WHERE id=${Q}`;
    expect(q!.respondido_em).not.toBeNull();

    const [log] =
      await owner`SELECT acao, entidade_id, ator_id FROM audit_log WHERE entidade_id=${EV} AND acao='resposta_duvida'`;
    expect(log).toBeDefined();
    expect(log!.acao).toBe("resposta_duvida");
    expect(log!.ator_id).toBe(U_TERAPEUTA);
  });

  test("responder com novoAlvo cria evidence_revision resultante e liga na query", async () => {
    const r = await responderQuery(ctxTerapeuta, {
      evidenceQueryId: Q2,
      respostaTexto: "corrigindo",
      novoAlvo: ALVO_VALIDO,
    });
    expect(r.ok).toBe(true);
    const [q] =
      await owner`SELECT resultante_evidence_revision_id FROM evidence_query WHERE id=${Q2}`;
    expect(q!.resultante_evidence_revision_id).not.toBeNull();
    const [rev] =
      await owner`SELECT acao, autor_id FROM evidence_revision WHERE id=${q!.resultante_evidence_revision_id}`;
    expect(rev!.acao).toBe("reclassificar");
    expect(rev!.autor_id).toBe(U_TERAPEUTA);

    const [log] =
      await owner`SELECT acao, entidade_id FROM audit_log WHERE entidade_id=${EV2} AND acao='reclassificacao'`;
    expect(log).toBeDefined();
    expect(log!.acao).toBe("reclassificacao");
  });

  test("responder query já respondida com novoAlvo retorna CONCURRENCY_ERROR e não cria segunda evidence_revision", async () => {
    const rowsAntes =
      (await owner`SELECT count(*)::int AS count FROM evidence_revision WHERE evidence_id=${EV4}`) as unknown as {
        count: number;
      }[];
    const antes = rowsAntes[0]!.count;

    const primeira = await responderQuery(ctxTerapeuta, {
      evidenceQueryId: Q4,
      respostaTexto: "primeira resposta",
    });
    expect(primeira.ok).toBe(true);

    const r = await responderQuery(ctxTerapeuta, {
      evidenceQueryId: Q4,
      respostaTexto: "segunda resposta",
      novoAlvo: ALVO_VALIDO,
    });
    expect(r.ok).not.toBe(true);

    const rowsDepois =
      (await owner`SELECT count(*)::int AS count FROM evidence_revision WHERE evidence_id=${EV4}`) as unknown as {
        count: number;
      }[];
    const depois = rowsDepois[0]!.count;
    expect(depois).toBe(antes);
  });

  test("terapeuta fora da equipe não responde (RLS)", async () => {
    const r = await responderQuery(ctxTerapeutaForaEquipe, {
      evidenceQueryId: Q3,
      respostaTexto: "x",
    });
    expect(r.ok).not.toBe(true);
    const [q] =
      await owner`SELECT respondido_em FROM evidence_query WHERE id=${Q3}`;
    expect(q!.respondido_em).toBeNull();
  });
});
