import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

const CLINIC = "00000000-0000-0000-0000-0000000000c1";
const OUTRA_CLINIC = "00000000-0000-0000-0000-0000000000c2";
const U_COORD = "00000000-0000-0000-0000-00000000c0a1";
const U_OUTRO = "00000000-0000-0000-0000-00000000c0a2";
const PAC = "00000000-0000-0000-0000-00000000ac01";
const PAC_OUTRA = "00000000-0000-0000-0000-00000000ac02";
const SESS = "00000000-0000-0000-0000-000000005e01";
const SESS_OUTRA = "00000000-0000-0000-0000-000000005e02";

const EX_BAIXA = "00000000-0000-0000-0000-00000000eb01";
const EX_OK = "00000000-0000-0000-0000-00000000e0a1";
const EX_INCONSISTENTE = "00000000-0000-0000-0000-00000000e1c1";
const EX_OUTRA_CLINICA = "00000000-0000-0000-0000-00000000e0c2";

const EV_BAIXA = "00000000-0000-0000-0000-00000000eb11";
const EV_OK = "00000000-0000-0000-0000-00000000e0a2";
const EV_INCONSISTENTE = "00000000-0000-0000-0000-00000000e1c2";
const EV_OUTRA_CLINICA = "00000000-0000-0000-0000-00000000e0c3";

const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let listarFilaValidacao: typeof import("./queries").listarFilaValidacao;

describe.skipIf(!hasDb)("listarFilaValidacao", () => {
  beforeAll(async () => {
    if (!hasDb) return;
    ({ listarFilaValidacao } = await import("./queries"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, evidence, evidence_revision, evidence_query RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica A'), (${OUTRA_CLINIC}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@a.com', 'Coordenador A'),
      (${U_OUTRO}, 'coord@b.com', 'Coordenador B')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_OUTRO}, ${OUTRA_CLINIC}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC}, 'Paciente A'),
      (${PAC_OUTRA}, ${OUTRA_CLINIC}, 'Paciente B')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC}, ${PAC}, ${U_COORD}, now(), 'realizada', 'desconhecida'),
      (${SESS_OUTRA}, ${OUTRA_CLINIC}, ${PAC_OUTRA}, ${U_OUTRO}, now(), 'realizada', 'desconhecida')`;

    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX_BAIXA}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'disse carro baixo volume', 'baixa', false, '{"funcao":"tato"}'),
      (${EX_OK}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'puxou a mão pro carro', 'alta', false, '{"funcao":"mando"}'),
      (${EX_INCONSISTENTE}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'regrediu de repente', 'alta', true, '{"funcao":"tato"}'),
      (${EX_OUTRA_CLINICA}, ${SESS_OUTRA}, ${OUTRA_CLINIC}, 'aprovada', 'evidencia', 'trecho outra clínica', 'baixa', false, '{"funcao":"tato"}')`;

    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV_BAIXA}, ${EX_BAIXA}, ${PAC}, ${SESS}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_OK}, ${EX_OK}, ${PAC}, ${SESS}, 1, 1, '{"funcao":"mando"}'::jsonb, ${U_COORD}),
      (${EV_INCONSISTENTE}, ${EX_INCONSISTENTE}, ${PAC}, ${SESS}, 1, 2, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_OUTRA_CLINICA}, ${EX_OUTRA_CLINICA}, ${PAC_OUTRA}, ${SESS_OUTRA}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_OUTRO})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("inclui evidência de baixa confiança, exclui alta confiança sem inconsistência", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    const ids = itens.map((i) => i.evidenceId);
    expect(ids).toContain(EV_BAIXA);
    expect(ids).not.toContain(EV_OK);
    expect(itens.find((i) => i.evidenceId === EV_BAIXA)!.motivo).toContain(
      "baixa_confianca",
    );
  });

  test("inclui evidência inconsistente com histórico", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).toContain(EV_INCONSISTENTE);
  });

  test("exclui evidência já tratada (tem evidence_revision)", async () => {
    await owner`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, justificativa, autor_id)
      VALUES (${EV_BAIXA}, 'confirmar', '{}'::jsonb, 'x', ${U_COORD})`;
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_BAIXA);
  });

  test("exclui evidência com evidence_query aberta", async () => {
    await owner`INSERT INTO evidence_query (evidence_id, coordenador_id, pergunta)
      VALUES (${EV_INCONSISTENTE}, ${U_COORD}, 'dúvida?')`;
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_INCONSISTENTE);
  });

  test("cross-tenant → não vê evidência de outra clínica", async () => {
    const { itens } = await listarFilaValidacao(ctxCoord);
    expect(itens.map((i) => i.evidenceId)).not.toContain(EV_OUTRA_CLINICA);
  });
});
