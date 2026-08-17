import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

const CLINIC = "00000000-0000-0000-0000-0000000000d1";
const U_COORD = "00000000-0000-0000-0000-00000000d0c1";
const U_TERAPEUTA = "00000000-0000-0000-0000-00000000d0e1";
const PAC = "00000000-0000-0000-0000-00000000dac1";
const SESS = "00000000-0000-0000-0000-00000000d5e1";

const EX = "00000000-0000-0000-0000-00000000de11";
const EX2 = "00000000-0000-0000-0000-00000000de12";
const EX3 = "00000000-0000-0000-0000-00000000de13";

const EV = "00000000-0000-0000-0000-00000000de21";
const EV2 = "00000000-0000-0000-0000-00000000de22";
const EV3 = "00000000-0000-0000-0000-00000000de23";
const EV4 = "00000000-0000-0000-0000-00000000de24";
const EV5 = "00000000-0000-0000-0000-00000000de25";

const PROTOCOL_FAMILIA = "vbmapp-d";

const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxTerapeuta = {
  clinicId: CLINIC,
  userId: U_TERAPEUTA,
  role: "terapeuta",
} as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let confirmarEvidencia: typeof import("./logic").confirmarEvidencia;
let invalidarEvidencia: typeof import("./logic").invalidarEvidencia;
let reclassificarEvidencia: typeof import("./logic").reclassificarEvidencia;
let devolverComDuvida: typeof import("./logic").devolverComDuvida;
let GOAL_ID: string;
let MARCO_SIMPLES_ID: string;
let ALVO_VALIDO: { goal_id: string };
const ALVO_FORA = { goal_id: "00000000-0000-0000-0000-00000000face" };
const ALVO_BARREIRA = {
  protocol_id: PROTOCOL_FAMILIA,
  dominio_id: "barreiras",
};
const EV6 = "00000000-0000-0000-0000-00000000de26";

describe.skipIf(!hasDb)("validação: confirmar + invalidar", () => {
  beforeAll(async () => {
    ({
      confirmarEvidencia,
      invalidarEvidencia,
      reclassificarEvidencia,
      devolverComDuvida,
    } = await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // `protocol_familia_catalogo` NÃO entra aqui: é dado de referência da
    // migração 0001, não fixture deste arquivo. Truncá-lo apagava as 4 famílias
    // do seed para todo mundo — nada as repõe — e quebrava, por ordem de
    // execução, quem dependesse delas (#222). Guard:
    // db/tests/no-truncate-reference-data.test.ts.
    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, evidence, evidence_revision, evidence_query, audit_log, protocol, patient_protocol, milestone, goal RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica D')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@d.com', 'Coordenador D'),
      (${U_TERAPEUTA}, 'terapeuta@d.com', 'Terapeuta D')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_TERAPEUTA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente D')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC}, ${PAC}, ${U_TERAPEUTA}, now(), 'realizada', 'desconhecida')`;
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 1', 'baixa', false, '{"funcao":"tato"}'),
      (${EX2}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 2', 'baixa', false, '{"funcao":"mando"}'),
      (${EX3}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 3', 'baixa', false, '{"funcao":"tato"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV}, ${EX}, ${PAC}, ${SESS}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV2}, ${EX2}, ${PAC}, ${SESS}, 1, 1, '{"funcao":"mando"}'::jsonb, ${U_COORD}),
      (${EV3}, ${EX3}, ${PAC}, ${SESS}, 1, 2, '{"funcao":"tato"}'::jsonb, ${U_COORD})`;

    // ─── Fixtures p/ reclassificação (Task 3): protocolo ATIVO + goal válido
    // do paciente, p/ validar `alvos.ts`.
    await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES (${PROTOCOL_FAMILIA}, 'VB-MAPP (teste D)') ON CONFLICT (id) DO NOTHING`;
    const [protocolo] =
      await owner`INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC}, 'VB-MAPP (teste D)', 'ABA', ${PROTOCOL_FAMILIA}, ${owner.json(["independente", "dica_verbal"])})
      RETURNING id`;
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES (${PAC}, ${protocolo!.id}, ${U_COORD})`;
    const [marcoSimples] =
      await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${protocolo!.id}, 'mando', 'Mando nível 1', 'marco_simples', ${owner.json({})})
      RETURNING id`;
    MARCO_SIMPLES_ID = marcoSimples!.id as string;
    // Marco de outro dominio, com tipo_estrutura DIFERENTE — usado no teste de
    // rejeição de reclassificação entre estruturas incompatíveis (fix Task 3).
    await owner`INSERT INTO milestone (protocol_id, dominio_id, nome, tipo_estrutura, estrutura)
      VALUES (${protocolo!.id}, 'barreiras', 'Barreira comportamental', 'marco_com_barreira', ${owner.json({ escala: [0, 1, 2] })})`;
    const [goalRow] =
      await owner`INSERT INTO goal (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC}, ${CLINIC}, 'Pedir água de forma independente', 'ativa', ${owner.json({ tipo: "sessoes_consecutivas_independente", valor: 2 })}, ${U_COORD})
      RETURNING id`;
    GOAL_ID = goalRow!.id as string;
    ALVO_VALIDO = { goal_id: GOAL_ID };

    const EX4 = "00000000-0000-0000-0000-00000000ee04";
    const EX5 = "00000000-0000-0000-0000-00000000ee05";
    const EX6 = "00000000-0000-0000-0000-00000000ee06";
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX4}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 4', 'baixa', false, '{"funcao":"mando"}'),
      (${EX5}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 5', 'baixa', false, '{"funcao":"mando"}'),
      (${EX6}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 6', 'baixa', false, '{"funcao":"mando"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV4}, ${EX4}, ${PAC}, ${SESS}, 1, 3, '{"nivel_ajuda":"dica_verbal","polaridade":"positiva"}'::jsonb, ${U_COORD}),
      (${EV5}, ${EX5}, ${PAC}, ${SESS}, 1, 4, '{"nivel_ajuda":"dica_verbal","polaridade":"positiva"}'::jsonb, ${U_COORD})`;
    // EV6: evidência com marco ORIGINAL resolvido (marco_simples) — usada no
    // teste de rejeição de reclassificação entre tipo_estrutura diferentes.
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, protocol_id, goal_id, milestone_id, classificacao_original, aprovado_por) VALUES
      (${EV6}, ${EX6}, ${PAC}, ${SESS}, 1, 5, ${protocolo!.id}, ${GOAL_ID}, ${MARCO_SIMPLES_ID}, '{"nivel_ajuda":"dica_verbal","polaridade":"positiva"}'::jsonb, ${U_COORD})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("confirmar grava evidence_revision(acao=confirmar), sem audit, sem recompute", async () => {
    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
    expect(r.ok).toBe(true);
    const [rev] =
      await owner`SELECT acao, justificativa FROM evidence_revision WHERE evidence_id=${EV}`;
    expect(rev!.acao).toBe("confirmar");
    const auditRows =
      await owner`SELECT 1 FROM audit_log WHERE entidade_id=${EV}`;
    expect(auditRows).toHaveLength(0);
  });

  test("confirmar de novo (já tratada) → CONCURRENCY_ERROR", async () => {
    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
    expect(r.error).toBe("CONCURRENCY_ERROR");
  });

  test("invalidar sem motivo → rejeita", async () => {
    const r = await invalidarEvidencia(ctxCoord, {
      evidenceId: EV2,
      motivo: "  ",
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV2}`;
    expect(rows).toHaveLength(0);
  });

  test("invalidar grava revisão + audit_log(invalidacao) + evidência sai do cômputo", async () => {
    const r = await invalidarEvidencia(ctxCoord, {
      evidenceId: EV2,
      motivo: "fora de contexto",
    });
    expect(r.ok).toBe(true);
    const [rev] =
      await owner`SELECT acao FROM evidence_revision WHERE evidence_id=${EV2}`;
    expect(rev!.acao).toBe("invalidar");
    const [log] =
      await owner`SELECT acao FROM audit_log WHERE entidade_id=${EV2} AND acao='invalidacao'`;
    expect(log!.acao).toBe("invalidacao");
    const [ec] =
      await owner`SELECT invalidada FROM evidence_current WHERE id=${EV2}`;
    expect(ec!.invalidada).toBe(true);
  });

  test("terapeuta não valida (rota coordenador-only via requireRole)", async () => {
    const r = await confirmarEvidencia(ctxTerapeuta, { evidenceId: EV3 });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV3}`;
    expect(rows).toHaveLength(0);
  });

  test("reclassificar sem justificativa → rejeita", async () => {
    const r = await reclassificarEvidencia(ctxCoord, {
      evidenceId: EV4,
      novoAlvo: ALVO_VALIDO,
      justificativa: " ",
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV4}`;
    expect(rows).toHaveLength(0);
  });

  test("reclassificar com alvo inválido (fora dos protocolos ativos) → rejeita", async () => {
    const r = await reclassificarEvidencia(ctxCoord, {
      evidenceId: EV4,
      novoAlvo: ALVO_FORA,
      justificativa: "x",
    });
    expect(r.error).toMatch(/alvo/i);
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV4}`;
    expect(rows).toHaveLength(0);
  });

  test("reclassificar grava classificacao_nova estruturada + audit(reclassificacao) + recompute reflete", async () => {
    const r = await reclassificarEvidencia(ctxCoord, {
      evidenceId: EV4,
      novoAlvo: ALVO_VALIDO,
      justificativa: "texto indica mando",
    });
    expect(r.ok).toBe(true);
    const [rev] =
      await owner`SELECT acao, classificacao_nova FROM evidence_revision WHERE evidence_id=${EV4}`;
    expect(rev!.acao).toBe("reclassificar");
    expect(rev!.classificacao_nova).not.toBeNull();
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE entidade_id=${EV4} AND acao='reclassificacao'`;
    expect(log).toBeTruthy();
    const [ec] =
      await owner`SELECT classificacao_atual FROM evidence_current WHERE id=${EV4}`;
    expect(JSON.stringify(ec!.classificacao_atual)).toContain(
      ALVO_VALIDO.goal_id,
    );
  });

  test("reclassificar entre tipo_estrutura diferentes (marco_simples → marco_com_barreira) → rejeita", async () => {
    // EV6 tem marco ORIGINAL marco_simples; ALVO_BARREIRA resolve p/ um
    // marco_com_barreira. Estruturas incompatíveis → rejeita, sem revisão.
    const r = await reclassificarEvidencia(ctxCoord, {
      evidenceId: EV6,
      novoAlvo: ALVO_BARREIRA,
      justificativa: "tentativa entre estruturas",
    });
    expect(r.error).toMatch(/estrutura/i);
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV6}`;
    expect(rows).toHaveLength(0);
  });

  test("devolver sem pergunta → rejeita", async () => {
    const r = await devolverComDuvida(ctxCoord, {
      evidenceId: EV3,
      pergunta: " ",
    });
    expect(r.error).toBeTruthy();
  });

  test("devolver abre evidence_query + audit(devolucao) + recompute exclui do cômputo", async () => {
    const r = await devolverComDuvida(ctxCoord, {
      evidenceId: EV3,
      pergunta: "isso é mando ou tato?",
    });
    expect(r.ok).toBe(true);
    const [q] =
      await owner`SELECT respondido_em FROM evidence_query WHERE evidence_id=${EV3}`;
    expect(q!.respondido_em).toBeNull();
    const [log] =
      await owner`SELECT 1 FROM audit_log WHERE entidade_id=${EV3} AND acao='devolucao'`;
    expect(log).toBeTruthy();
  });

  test("regra 6 · confirmarEvidencia para paciente arquivado desarquiva e grava trilha", async () => {
    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await owner`UPDATE patient SET arquivado_em = now() - interval '10 days' WHERE id = ${PAC}`;

    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV5 });
    expect(r.ok).toBe(true);

    const [pac] =
      await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
    expect(pac!.arquivado_em).toBeNull();

    const [log] =
      await owner`SELECT acao, detalhe FROM audit_log WHERE patient_id = ${PAC} AND acao = 'paciente_desarquivado_automaticamente'`;
    expect(log).toBeTruthy();
    expect(log!.detalhe).toEqual({ origem: "validacao_evidencia" });

    await owner`UPDATE patient SET arquivado_em = NULL WHERE id = ${PAC}`;
  });

  test("regra 6 · reclassificarEvidencia para paciente arquivado desarquiva e grava trilha", async () => {
    const EX7 = "00000000-0000-0000-0000-00000000ee07";
    const EV7 = "00000000-0000-0000-0000-00000000de27";
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload)
      VALUES (${EX7}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho 7', 'baixa', false, '{"funcao":"mando"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por)
      VALUES (${EV7}, ${EX7}, ${PAC}, ${SESS}, 1, 7, '{"nivel_ajuda":"dica_verbal","polaridade":"positiva"}'::jsonb, ${U_COORD})`;

    await owner`DELETE FROM audit_log WHERE patient_id = ${PAC}`;
    await owner`UPDATE patient SET arquivado_em = now() - interval '10 days' WHERE id = ${PAC}`;

    const r = await reclassificarEvidencia(ctxCoord, {
      evidenceId: EV7,
      novoAlvo: ALVO_VALIDO,
      justificativa: "reclassificando em paciente arquivado",
    });
    expect(r.ok).toBe(true);

    const [pac] =
      await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
    expect(pac!.arquivado_em).toBeNull();

    const [log] =
      await owner`SELECT acao, detalhe FROM audit_log WHERE patient_id = ${PAC} AND acao = 'paciente_desarquivado_automaticamente'`;
    expect(log).toBeTruthy();
    expect(log!.detalhe).toEqual({ origem: "validacao_evidencia" });

    await owner`UPDATE patient SET arquivado_em = NULL WHERE id = ${PAC}`;
  });
});
