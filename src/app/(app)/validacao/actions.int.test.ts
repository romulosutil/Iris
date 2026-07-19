import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

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

const ctxCoord = { clinicId: CLINIC, userId: U_COORD, role: "coordenador" } as const;
const ctxTerapeuta = { clinicId: CLINIC, userId: U_TERAPEUTA, role: "terapeuta" } as const;

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let confirmarEvidencia: typeof import("./actions").confirmarEvidencia;
let invalidarEvidencia: typeof import("./actions").invalidarEvidencia;

describe.skipIf(!hasDb)("validação: confirmar + invalidar", () => {
  beforeAll(async () => {
    ({ confirmarEvidencia, invalidarEvidencia } = await import("./actions"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, evidence, evidence_revision, evidence_query, audit_log RESTART IDENTITY CASCADE`;
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
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("confirmar grava evidence_revision(acao=confirmar), sem audit, sem recompute", async () => {
    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
    expect(r.ok).toBe(true);
    const [rev] = await owner`SELECT acao, justificativa FROM evidence_revision WHERE evidence_id=${EV}`;
    expect(rev!.acao).toBe("confirmar");
    const auditRows = await owner`SELECT 1 FROM audit_log WHERE entidade_id=${EV}`;
    expect(auditRows).toHaveLength(0);
  });

  test("confirmar de novo (já tratada) → CONCURRENCY_ERROR", async () => {
    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV });
    expect(r.error).toBe("CONCURRENCY_ERROR");
  });

  test("invalidar sem motivo → rejeita", async () => {
    const r = await invalidarEvidencia(ctxCoord, { evidenceId: EV2, motivo: "  " });
    expect(r.error).toBeTruthy();
    const rows = await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV2}`;
    expect(rows).toHaveLength(0);
  });

  test("invalidar grava revisão + audit_log(invalidacao) + evidência sai do cômputo", async () => {
    const r = await invalidarEvidencia(ctxCoord, { evidenceId: EV2, motivo: "fora de contexto" });
    expect(r.ok).toBe(true);
    const [rev] = await owner`SELECT acao FROM evidence_revision WHERE evidence_id=${EV2}`;
    expect(rev!.acao).toBe("invalidar");
    const [log] = await owner`SELECT acao FROM audit_log WHERE entidade_id=${EV2} AND acao='invalidacao'`;
    expect(log!.acao).toBe("invalidacao");
    const [ec] = await owner`SELECT invalidada FROM evidence_current WHERE id=${EV2}`;
    expect(ec!.invalidada).toBe(true);
  });

  test("terapeuta não valida (rota coordenador-only via requireRole)", async () => {
    const r = await confirmarEvidencia(ctxTerapeuta, { evidenceId: EV3 });
    expect(r.error).toBeTruthy();
    const rows = await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV3}`;
    expect(rows).toHaveLength(0);
  });
});
