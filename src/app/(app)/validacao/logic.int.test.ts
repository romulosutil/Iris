import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// Aprovação em lote da fila de validação (#248). Mesmo harness de
// `actions.int.test.ts`: ctx forjado + banco real (owner p/ fixtures,
// core chamado direto com ctx — exercita o guard `comEscrita` de verdade).

const CLINIC = "00000000-0000-0000-0000-0000000000e1";
const U_COORD = "00000000-0000-0000-0000-00000000e0c1";
const U_TERAPEUTA = "00000000-0000-0000-0000-00000000e0e1";
const PAC = "00000000-0000-0000-0000-00000000eac1";
const SESS = "00000000-0000-0000-0000-00000000e5e1";

// Extrações: A1/A2/A3 alta+consistente (elegíveis a lote), B baixa confiança,
// I alta porém inconsistente com histórico, R baixa (regressão individual).
const EX_A1 = "00000000-0000-0000-0000-00000000ee11";
const EX_A2 = "00000000-0000-0000-0000-00000000ee12";
const EX_A3 = "00000000-0000-0000-0000-00000000ee13";
const EX_B = "00000000-0000-0000-0000-00000000ee14";
const EX_I = "00000000-0000-0000-0000-00000000ee15";
const EX_R = "00000000-0000-0000-0000-00000000ee16";
// T: alta+consistente, mas recebe `evidence_revision` prévia no arrange do
// próprio teste "já tratada" (autossuficiente, sem depender de outro teste).
const EX_T = "00000000-0000-0000-0000-00000000ee17";

const EV_A1 = "00000000-0000-0000-0000-00000000ee21";
const EV_A2 = "00000000-0000-0000-0000-00000000ee22";
const EV_A3 = "00000000-0000-0000-0000-00000000ee23";
const EV_B = "00000000-0000-0000-0000-00000000ee24";
const EV_I = "00000000-0000-0000-0000-00000000ee25";
const EV_R = "00000000-0000-0000-0000-00000000ee26";
const EV_T = "00000000-0000-0000-0000-00000000ee27";

// Clínica B (cross-tenant): evidência elegível que o coordenador da clínica A
// NUNCA pode aprovar em lote (RLS a torna invisível → lote aborta sem escrita).
const CLINIC_B = "00000000-0000-0000-0000-0000000000e2";
const U_TERAPEUTA_B = "00000000-0000-0000-0000-00000000e0e2";
const PAC_B = "00000000-0000-0000-0000-00000000eac2";
const SESS_B = "00000000-0000-0000-0000-00000000e5e2";
const EX_XB = "00000000-0000-0000-0000-00000000ee18";
const EV_XB = "00000000-0000-0000-0000-00000000ee28";

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
let aprovarEvidenciasLote: typeof import("./logic").aprovarEvidenciasLote;
let confirmarEvidencia: typeof import("./logic").confirmarEvidencia;

describe.skipIf(!hasDb)("validação: aprovação em lote (#248)", () => {
  beforeAll(async () => {
    ({ aprovarEvidenciasLote, confirmarEvidencia } = await import("./logic"));
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // `protocol_familia_catalogo` fica FORA do TRUNCATE — dado de referência do
    // seed (#222); guard: db/tests/no-truncate-reference-data.test.ts.
    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction, evidence, evidence_revision, evidence_query, audit_log, protocol, patient_protocol, milestone, goal RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica E')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord@e.com', 'Coordenador E'),
      (${U_TERAPEUTA}, 'terapeuta@e.com', 'Terapeuta E')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_TERAPEUTA}, ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente E')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS}, ${CLINIC}, ${PAC}, ${U_TERAPEUTA}, now(), 'realizada', 'desconhecida')`;
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX_A1}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho a1', 'alta', false, '{"funcao":"tato"}'),
      (${EX_A2}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho a2', 'alta', false, '{"funcao":"mando"}'),
      (${EX_A3}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho a3', 'alta', false, '{"funcao":"tato"}'),
      (${EX_B}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho b', 'baixa', false, '{"funcao":"tato"}'),
      (${EX_I}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho i', 'alta', true, '{"funcao":"mando"}'),
      (${EX_R}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho r', 'baixa', false, '{"funcao":"tato"}'),
      (${EX_T}, ${SESS}, ${CLINIC}, 'aprovada', 'evidencia', 'trecho t', 'alta', false, '{"funcao":"tato"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV_A1}, ${EX_A1}, ${PAC}, ${SESS}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_A2}, ${EX_A2}, ${PAC}, ${SESS}, 1, 1, '{"funcao":"mando"}'::jsonb, ${U_COORD}),
      (${EV_A3}, ${EX_A3}, ${PAC}, ${SESS}, 1, 2, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_B}, ${EX_B}, ${PAC}, ${SESS}, 1, 3, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_I}, ${EX_I}, ${PAC}, ${SESS}, 1, 4, '{"funcao":"mando"}'::jsonb, ${U_COORD}),
      (${EV_R}, ${EX_R}, ${PAC}, ${SESS}, 1, 5, '{"funcao":"tato"}'::jsonb, ${U_COORD}),
      (${EV_T}, ${EX_T}, ${PAC}, ${SESS}, 1, 6, '{"funcao":"tato"}'::jsonb, ${U_COORD})`;

    // ── Clínica B: evidência elegível (alta+consistente) de OUTRO tenant ──
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_B}, 'Clínica B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES (${U_TERAPEUTA_B}, 'terapeuta@b.com', 'Terapeuta B')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_TERAPEUTA_B}, ${CLINIC_B}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC_B}, ${CLINIC_B}, 'Paciente B')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS_B}, ${CLINIC_B}, ${PAC_B}, ${U_TERAPEUTA_B}, now(), 'realizada', 'desconhecida')`;
    await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
      (${EX_XB}, ${SESS_B}, ${CLINIC_B}, 'aprovada', 'evidencia', 'trecho xb', 'alta', false, '{"funcao":"tato"}')`;
    await owner`INSERT INTO evidence (id, extraction_id, patient_id, session_id, session_numero, alvo_ordinal, classificacao_original, aprovado_por) VALUES
      (${EV_XB}, ${EX_XB}, ${PAC_B}, ${SESS_B}, 1, 0, '{"funcao":"tato"}'::jsonb, ${U_TERAPEUTA_B})`;
  });

  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });

  test("lote vazio → erro, nada aplicado", async () => {
    const r = await aprovarEvidenciasLote(ctxCoord, { evidenceIds: [] });
    expect(r.error).toBeTruthy();
    const rows = await owner`SELECT 1 FROM evidence_revision`;
    expect(rows).toHaveLength(0);
  });

  test("terapeuta não aprova em lote (coordenador-only)", async () => {
    const r = await aprovarEvidenciasLote(ctxTerapeuta, {
      evidenceIds: [EV_A1],
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV_A1}`;
    expect(rows).toHaveLength(0);
  });

  test("lote com item de baixa confiança → erro e NADA aplicado (atomicidade)", async () => {
    const r = await aprovarEvidenciasLote(ctxCoord, {
      evidenceIds: [EV_A1, EV_B],
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id IN (${EV_A1}, ${EV_B})`;
    expect(rows).toHaveLength(0);
    const audit =
      await owner`SELECT 1 FROM audit_log WHERE acao='evidencia_aprovada_lote'`;
    expect(audit).toHaveLength(0);
  });

  test("lote com item inconsistente com histórico → erro e NADA aplicado", async () => {
    const r = await aprovarEvidenciasLote(ctxCoord, {
      evidenceIds: [EV_A1, EV_I],
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id IN (${EV_A1}, ${EV_I})`;
    expect(rows).toHaveLength(0);
  });

  test("lote com id inexistente → erro e NADA aplicado", async () => {
    const r = await aprovarEvidenciasLote(ctxCoord, {
      evidenceIds: [EV_A1, "00000000-0000-0000-0000-00000000face"],
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV_A1}`;
    expect(rows).toHaveLength(0);
  });

  test("happy path: lote de 2 elegíveis → 2 revisões confirmar + 2 audit_log", async () => {
    const r = await aprovarEvidenciasLote(ctxCoord, {
      evidenceIds: [EV_A1, EV_A2],
    });
    expect(r.ok).toBe(true);
    expect(r.aprovadas).toBe(2);

    const revs =
      await owner`SELECT evidence_id, acao, justificativa, classificacao_nova FROM evidence_revision WHERE evidence_id IN (${EV_A1}, ${EV_A2}) ORDER BY criado_em`;
    expect(revs).toHaveLength(2);
    for (const rev of revs) {
      expect(rev.acao).toBe("confirmar");
      // Paridade com a confirmação individual: frase humana na revisão,
      // token de máquina só no detalhe do audit_log; confirmar não muda a
      // classificação → classificacao_nova NULL.
      expect(rev.justificativa).toBe("Aprovado em lote pelo coordenador.");
      expect(rev.classificacao_nova).toBeNull();
    }

    const audit =
      await owner`SELECT entidade, detalhe FROM audit_log WHERE acao='evidencia_aprovada_lote' AND entidade_id IN (${EV_A1}, ${EV_A2})`;
    expect(audit).toHaveLength(2);
    for (const a of audit) {
      expect(a.entidade).toBe("evidence");
      expect(a.detalhe).toMatchObject({
        justificativa: "aprovacao_em_lote",
        lote_tamanho: 2,
      });
    }
  });

  test("re-aprovar evidência já tratada em lote → CONCURRENCY, nada novo", async () => {
    // Arrange autossuficiente: a revisão prévia de EV_T é criada AQUI (não
    // dependemos do happy path ter tratado outro id antes).
    await owner`INSERT INTO evidence_revision (evidence_id, acao, classificacao_anterior, classificacao_nova, justificativa, autor_id)
      VALUES (${EV_T}, 'confirmar', '{"funcao":"tato"}'::jsonb, NULL, 'Confirmado pelo coordenador.', ${U_COORD})`;

    const r = await aprovarEvidenciasLote(ctxCoord, {
      evidenceIds: [EV_T, EV_A3],
    });
    expect(r.error).toBeTruthy();
    const rows =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV_A3}`;
    expect(rows).toHaveLength(0);
    const revT =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV_T}`;
    expect(revT).toHaveLength(1); // só a do arrange
  });

  test("cross-tenant: coordenador da clínica A não aprova evidência da clínica B", async () => {
    const antesRev = await owner`SELECT count(*)::int AS n FROM evidence_revision`;
    const antesAudit = await owner`SELECT count(*)::int AS n FROM audit_log`;

    const r = await aprovarEvidenciasLote(ctxCoord, { evidenceIds: [EV_XB] });
    // RLS torna a evidência de B invisível para o ctx da clínica A.
    expect(r.error).toBeTruthy();
    expect(r.ok).toBeUndefined();

    const depoisRev = await owner`SELECT count(*)::int AS n FROM evidence_revision`;
    const depoisAudit = await owner`SELECT count(*)::int AS n FROM audit_log`;
    expect(depoisRev[0]!.n).toBe(antesRev[0]!.n);
    expect(depoisAudit[0]!.n).toBe(antesAudit[0]!.n);
    const revB =
      await owner`SELECT 1 FROM evidence_revision WHERE evidence_id=${EV_XB}`;
    expect(revB).toHaveLength(0);
  });

  test("lote acima de 50 ids → erro de validação, nada aplicado", async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-0000-0000-${String(100000000000 + i)}`,
    );
    const r = await aprovarEvidenciasLote(ctxCoord, { evidenceIds: ids });
    expect(r.error).toMatch(/limite de 50/);
  });

  test("regressão: confirmarEvidencia individual continua ok", async () => {
    const r = await confirmarEvidencia(ctxCoord, { evidenceId: EV_R });
    expect(r.ok).toBe(true);
    const [rev] =
      await owner`SELECT acao, justificativa FROM evidence_revision WHERE evidence_id=${EV_R}`;
    expect(rev!.acao).toBe("confirmar");
    expect(rev!.justificativa).toBe("Confirmado pelo coordenador.");
  });
});
