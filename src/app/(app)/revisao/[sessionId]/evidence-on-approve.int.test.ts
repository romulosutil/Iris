/**
 * Fase 4 — inserção de `evidence` on-approve (spec
 * docs/superpowers/specs/2026-07-13-fase-4-resolucao-slug-uuid.md §4).
 * Prova que aprovar/editar uma extração `evidencia` grava 1 `evidence` por
 * alvo, com o resolvedor compartilhado (`src/lib/evidence/resolver.ts`)
 * resolvendo goal/protocol quando possível e deixando `milestoneId` nulo
 * quando o domínio é ambíguo (decisão §3 opção C).
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;
const CLINIC = "00000000-0000-0000-0000-0000000000f1";
const U_T1 = "00000000-0000-0000-0000-0000000071f1"; // dono da sessão, na equipe do paciente
const PAC = "00000000-0000-0000-0000-00000000acf1";
const SESS = "00000000-0000-0000-0000-00000005e1f1";
const PROTOCOL = "00000000-0000-0000-0000-000000010001";
const GOAL = "00000000-0000-0000-0000-000000020001";
// dois marcos para o MESMO (protocolo, domínio) → ambíguo, milestoneId deve ficar null
const MILESTONE_MANDO_1 = "00000000-0000-0000-0000-000000030001";
const MILESTONE_MANDO_2 = "00000000-0000-0000-0000-000000030002";
// um único marco para (protocolo, domínio "tato") → não ambíguo, deve resolver
const MILESTONE_TATO = "00000000-0000-0000-0000-000000030003";

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;

const EX_AMBIGUO = "00000000-0000-0000-0000-00000e0a0001"; // dominio ambíguo (2 marcos)
const EX_UNICO = "00000000-0000-0000-0000-00000e0a0002"; // dominio com 1 marco só

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./actions");

async function seed() {
  await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
    session, extraction, evidence, protocol, patient_protocol, goal, milestone
    RESTART IDENTITY CASCADE`;

  await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
    ('vbmapp', 'VB-MAPP') ON CONFLICT (id) DO NOTHING`;

  await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica evidence on-approve')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES (${U_T1}, 't1.ev@t.com', 'T1')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T1}, ${CLINIC}, 'terapeuta')`;
  await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente')`;
  await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
    VALUES (${PAC}, ${U_T1}, 'ABA', 'terapeuta_referencia')`;
  // sessão JÁ consolidada (numero_sequencial_paciente preenchido) — caso "feliz"
  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente) VALUES
    (${SESS}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'realizada', 1)`;

  await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
    (${PROTOCOL}, ${CLINIC}, 'VB-MAPP', 'ABA', 'vbmapp')`;
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
    (${PAC}, ${PROTOCOL}, ${U_T1})`;
  await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por) VALUES
    (${GOAL}, ${PAC}, ${CLINIC}, 'Meta de mando', ${owner.json({ tipo: "percentual", valor: 80 })}, ${U_T1})`;
  await owner`INSERT INTO milestone (id, protocol_id, dominio_id, nome, nivel, tipo_estrutura, estrutura) VALUES
    (${MILESTONE_MANDO_1}, ${PROTOCOL}, 'mando', 'Mando nível 1', '1', 'marco_simples', '{}'),
    (${MILESTONE_MANDO_2}, ${PROTOCOL}, 'mando', 'Mando nível 2', '2', 'marco_simples', '{}'),
    (${MILESTONE_TATO}, ${PROTOCOL}, 'tato', 'Tato nível 1', '1', 'marco_simples', '{}')`;

  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
    (${EX_AMBIGUO}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'puxou a mão pedindo suco', 'alta',
      ${owner.json({
        evidencia: {
          descricao: "pediu suco",
          funcao: "mando",
          alvos: [{ goal_id: GOAL, protocol_id: "vbmapp", dominio_id: "mando" }],
        },
      })}),
    (${EX_UNICO}, ${SESS}, ${CLINIC}, 'sugerida', 'evidencia', 'nomeou o carro', 'alta',
      ${owner.json({
        evidencia: {
          descricao: "nomeou o carro",
          funcao: "tato",
          alvos: [{ goal_id: null, protocol_id: "vbmapp", dominio_id: "tato" }],
        },
      })})`;
}

describe.skipIf(!hasDb)("evidence on-approve (Fase 4)", () => {
  beforeAll(async () => {
    A = await import("./actions");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });
  beforeEach(seed);

  test("aprovar extração com domínio AMBÍGUO (2 marcos): resolve goal+protocol, milestoneId fica null", async () => {
    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX_AMBIGUO, versao: 1 });
    expect(r.ok).toBe(true);

    const rows = await owner`SELECT * FROM evidence WHERE extraction_id = ${EX_AMBIGUO}`;
    expect(rows.length).toBe(1);
    const ev = rows[0]!;
    expect(ev.alvo_ordinal).toBe(0);
    expect(ev.goal_id).toBe(GOAL);
    expect(ev.protocol_id).toBe(PROTOCOL);
    expect(ev.milestone_id).toBeNull(); // ambíguo — decisão §3 opção C
    expect(ev.protocol_slug).toBe("vbmapp");
    expect(ev.dominio_id).toBe("mando");
    expect(ev.goal_ref).toBe(GOAL);
    expect(ev.session_numero).toBe(1);
    expect(ev.aprovado_por).toBe(U_T1);
  });

  test("aprovar extração com domínio COM 1 MARCO SÓ: milestoneId resolve", async () => {
    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX_UNICO, versao: 1 });
    expect(r.ok).toBe(true);

    const [ev] = await owner`SELECT * FROM evidence WHERE extraction_id = ${EX_UNICO}`;
    expect(ev!.protocol_id).toBe(PROTOCOL);
    expect(ev!.milestone_id).toBe(MILESTONE_TATO);
    expect(ev!.goal_id).toBeNull(); // alvo não trouxe goal_id
  });

  test("idempotente: re-aprovar (2ª chamada) não duplica evidence", async () => {
    const r1 = await A.aprovarExtracao(ctxT1, { extractionId: EX_AMBIGUO, versao: 1 });
    expect(r1.ok).toBe(true);

    // 2ª chamada: extração já não está mais 'sugerida' → transicionar não acha
    // a linha, não reexecuta a inserção de evidence.
    const r2 = await A.aprovarExtracao(ctxT1, { extractionId: EX_AMBIGUO, versao: 1 });
    expect(r2.ok).toBe(false);

    const rows = await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_AMBIGUO}`;
    expect(rows.length).toBe(1);
  });

  test("editar (não só aprovar) também insere evidence, a partir do payload_editado", async () => {
    const r = await A.editarExtracao(ctxT1, {
      extractionId: EX_UNICO,
      payloadEditado: {
        evidencia: {
          descricao: "nomeou o carro (corrigido)",
          funcao: "tato",
          alvos: [{ goal_id: null, protocol_id: "vbmapp", dominio_id: "tato" }],
        },
      },
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const [ev] = await owner`SELECT * FROM evidence WHERE extraction_id = ${EX_UNICO}`;
    expect(ev!.milestone_id).toBe(MILESTONE_TATO);
    expect(ev!.classificacao_original).toMatchObject({
      alvo: { protocol_id: "vbmapp", dominio_id: "tato" },
    });
  });

  test("sessão sem numero_sequencial_paciente: aprovação segue OK, mas evidence NÃO é inserida", async () => {
    const SESS_SEM_NUMERO = "00000000-0000-0000-0000-00000005e1f2";
    const EX_SEM_NUMERO = "00000000-0000-0000-0000-00000e0a0003";
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado) VALUES
      (${SESS_SEM_NUMERO}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'presente')`;
    await owner`INSERT INTO extraction
        (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX_SEM_NUMERO}, ${SESS_SEM_NUMERO}, ${CLINIC}, 'sugerida', 'evidencia', 'pediu suco', 'alta',
        ${owner.json({ evidencia: { alvos: [{ protocol_id: "vbmapp", dominio_id: "tato" }] } })})`;

    const r = await A.aprovarExtracao(ctxT1, { extractionId: EX_SEM_NUMERO, versao: 1 });
    expect(r.ok).toBe(true); // a revisão em si não falha

    const rows = await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_SEM_NUMERO}`;
    expect(rows.length).toBe(0);
  });
});
