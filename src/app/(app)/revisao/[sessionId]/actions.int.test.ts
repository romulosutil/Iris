import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC = "00000000-0000-0000-0000-0000000000b1";
const U_T1 = "00000000-0000-0000-0000-0000000071b1"; // dono da sessão
const U_T2 = "00000000-0000-0000-0000-0000000072b1"; // outro terapeuta
const PAC = "00000000-0000-0000-0000-0000000ac1b1";
const SESS = "00000000-0000-0000-0000-00000005e1b1";
const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC, userId: U_T2, role: "terapeuta" } as const;

// ids fixos de extração por cenário
const EX_ALTA = "00000000-0000-0000-0000-00000e0a17a1";
const EX_BAIXA = "00000000-0000-0000-0000-00000e0ba17a";
const EX_INCONS = "00000000-0000-0000-0000-00000e01c0a1";
const EX_PEND = "00000000-0000-0000-0000-00000e0e0da1";

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./actions");

async function seedExtracoes() {
  await owner`DELETE FROM extraction WHERE session_id = ${SESS}`;
  await owner`INSERT INTO extraction (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
    (${EX_ALTA},   ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'puxou a mão', 'alta',  false, '{"funcao":"mando"}'),
    (${EX_BAIXA},  ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'disse carro', 'baixa', false, '{"funcao_indefinida":true}'),
    (${EX_INCONS}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'regrediu',    'alta',  true,  '{"funcao":"tato"}'),
    (${EX_PEND},   ${SESS}, ${CLINIC}, 'pendente_reprocessamento', 'pendente', '', 'baixa', false, '{"motivo":"x"}')`;
}

describe.skipIf(!hasDb)("revisão de extrações", () => {
  beforeAll(async () => {
    A = await import("./actions");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, session, extraction RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'B')`;
    await owner`INSERT INTO app_user (id, email, name) VALUES (${U_T1},'t1@b.com','T1'),(${U_T2},'t2@b.com','T2')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T1},${CLINIC},'terapeuta'),(${U_T2},${CLINIC},'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'P')`;
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'presente')`;
  });
  afterAll(async () => { await owner?.end(); await appSql?.end(); });
  beforeEach(seedExtracoes);

  test("terapeuta dono aprova uma sugerida → estado aprovada + revisado_por", async () => {
    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX_ALTA });
    expect(r.ok).toBe(true);
    const [row] = await owner`SELECT estado, revisado_por, revisado_em FROM extraction WHERE id = ${EX_ALTA}`;
    expect(row!.estado).toBe("aprovada");
    expect(row!.revisado_por).toBe(U_T1);
    expect(row!.revisado_em).not.toBeNull();
  });

  test("descartar → estado descartada", async () => {
    const r = await A.descartarExtracao(ctxT1, { extractionId: EX_BAIXA });
    expect(r.ok).toBe(true);
    const [row] = await owner`SELECT estado FROM extraction WHERE id = ${EX_BAIXA}`;
    expect(row!.estado).toBe("descartada");
  });

  test("editar → estado editada + payload_editado, payload ORIGINAL intacto (auditoria)", async () => {
    const r = await A.editarExtracao(ctxT1, {
      extractionId: EX_INCONS,
      payloadEditado: { funcao: "mando", nivel_ajuda: "dica_fisica" },
    });
    expect(r.ok).toBe(true);
    const [row] = await owner`SELECT estado, payload, payload_editado FROM extraction WHERE id = ${EX_INCONS}`;
    expect(row!.estado).toBe("editada");
    expect((row!.payload as { funcao: string }).funcao).toBe("tato"); // original imutável
    expect((row!.payload_editado as { funcao: string }).funcao).toBe("mando");
  });

  test("não age em extração pendente de reprocessamento (só sugerida é revisável)", async () => {
    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX_PEND });
    expect(r.ok).toBe(false);
    const [row] = await owner`SELECT estado FROM extraction WHERE id = ${EX_PEND}`;
    expect(row!.estado).toBe("pendente_reprocessamento");
  });

  test("terapeuta que não é dono da sessão é barrado pelo RLS (nada muda)", async () => {
    const r = await A.aprovarExtracao(ctxT2, { extractionId: EX_ALTA });
    expect(r.ok).toBe(false); // RLS USING filtra a linha → 0 updates
    const [row] = await owner`SELECT estado FROM extraction WHERE id = ${EX_ALTA}`;
    expect(row!.estado).toBe("sugerida");
  });

  test("aprovar lote só aprova elegíveis (alta, sem inconsistência); ignora o resto", async () => {
    const r = await A.aprovarLote(ctxT1, {
      extractionIds: [EX_ALTA, EX_BAIXA, EX_INCONS],
    });
    expect(r.aprovadas).toBe(1); // só EX_ALTA
    expect(r.ignoradas).toBe(2); // baixa + inconsistente exigem revisão individual
    const rows = await owner`SELECT id, estado FROM extraction WHERE id IN (${EX_ALTA}, ${EX_BAIXA}, ${EX_INCONS})`;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.estado]));
    expect(byId[EX_ALTA]).toBe("aprovada");
    expect(byId[EX_BAIXA]).toBe("sugerida");
    expect(byId[EX_INCONS]).toBe("sugerida");
  });
});
