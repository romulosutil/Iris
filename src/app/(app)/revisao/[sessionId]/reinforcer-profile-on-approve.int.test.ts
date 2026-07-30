/**
 * Fase 4 (4C.1) — inserção de `reinforcer_profile` on-approve. Mesmo padrão
 * de db/tests/evidence-on-approve.int.test.ts: aprovar/editar uma extração
 * `preferencia_reforcador` grava 1 linha (append-per-observation), idempotente
 * em (extraction_id, item_atividade).
 */
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

const CLINIC = "00000000-0000-0000-0000-0000000000f3";
const U_T1 = "00000000-0000-0000-0000-0000000071f3"; // dono da sessão, na equipe do paciente
const PAC = "00000000-0000-0000-0000-00000000acf3";
const SESS = "00000000-0000-0000-0000-00000005e1f3";

const ctxT1 = { clinicId: CLINIC, userId: U_T1, role: "terapeuta" } as const;

const EX_PREF = "00000000-0000-0000-0000-00000e0a0004";

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./logic");

async function seed() {
  await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
    session, extraction, reinforcer_profile RESTART IDENTITY CASCADE`;

  await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica reinforcer on-approve')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES (${U_T1}, 't1.rp@t.com', 'T1')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_T1}, ${CLINIC}, 'terapeuta')`;
  await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente')`;
  await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
    VALUES (${PAC}, ${U_T1}, 'ABA', 'terapeuta_referencia')`;
  // sessão JÁ consolidada (numero_sequencial_paciente preenchido) — caso "feliz"
  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
    (${SESS}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'realizada', 1, 'aba')`;

  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
    (${EX_PREF}, ${SESS}, ${CLINIC}, 'sugerida', 'preferencia_reforcador', 'adorou o carrinho', 'alta',
      ${owner.json({ preferencia_reforcador: { item_atividade: "carrinho de brinquedo", valencia: "alta" } })})`;
}

describe.skipIf(!hasDb)("reinforcer_profile on-approve (Fase 4 · 4C.1)", () => {
  beforeAll(async () => {
    A = await import("./logic");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
    await appSql?.end();
  });
  beforeEach(seed);

  test("aprovar extração preferencia_reforcador grava 1 reinforcer_profile", async () => {
    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_PREF,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const rows =
      await owner`SELECT * FROM reinforcer_profile WHERE extraction_id = ${EX_PREF}`;
    expect(rows.length).toBe(1);
    const rp = rows[0]!;
    expect(rp.item_atividade).toBe("carrinho de brinquedo");
    expect(rp.valencia).toBe("alta");
    expect(rp.session_numero).toBe(1);
    expect(rp.patient_id).toBe(PAC);
  });

  test("idempotente: re-aprovar (2ª chamada) não duplica reinforcer_profile", async () => {
    const r1 = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_PREF,
      versao: 1,
    });
    expect(r1.ok).toBe(true);

    // 2ª chamada: extração já não está mais 'sugerida' → transicionar não acha
    // a linha, não reexecuta a inserção.
    const r2 = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_PREF,
      versao: 1,
    });
    expect(r2.ok).toBe(false);

    const rows =
      await owner`SELECT id FROM reinforcer_profile WHERE extraction_id = ${EX_PREF}`;
    expect(rows.length).toBe(1);
  });

  test("editar (não só aprovar) também insere reinforcer_profile, a partir do payload_editado", async () => {
    const r = await A.editarExtracao(ctxT1, {
      extractionId: EX_PREF,
      payloadEditado: {
        preferencia_reforcador: {
          item_atividade: "bolha de sabão",
          valencia: "saciado",
        },
      },
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const [rp] =
      await owner`SELECT * FROM reinforcer_profile WHERE extraction_id = ${EX_PREF}`;
    expect(rp!.item_atividade).toBe("bolha de sabão");
    expect(rp!.valencia).toBe("saciado");
  });

  test("item_atividade vazio: aprovação segue OK, mas reinforcer_profile NÃO é inserido", async () => {
    const EX_VAZIO = "00000000-0000-0000-0000-00000e0a0005";
    await owner`INSERT INTO extraction
        (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX_VAZIO}, ${SESS}, ${CLINIC}, 'sugerida', 'preferencia_reforcador', 'sem item claro', 'baixa',
        ${owner.json({ preferencia_reforcador: { item_atividade: "", valencia: "alta" } })})`;

    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_VAZIO,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const rows =
      await owner`SELECT id FROM reinforcer_profile WHERE extraction_id = ${EX_VAZIO}`;
    expect(rows.length).toBe(0);
  });

  test("sessão sem numero_sequencial_paciente: aprovação segue OK, mas reinforcer_profile NÃO é inserido", async () => {
    const SESS_SEM_NUMERO = "00000000-0000-0000-0000-00000005e1f4";
    const EX_SEM_NUMERO = "00000000-0000-0000-0000-00000e0a0006";
    await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESS_SEM_NUMERO}, ${CLINIC}, ${PAC}, ${U_T1}, now(), 'realizada', 'aba')`;
    await owner`INSERT INTO extraction
        (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, payload) VALUES
      (${EX_SEM_NUMERO}, ${SESS_SEM_NUMERO}, ${CLINIC}, 'sugerida', 'preferencia_reforcador', 'adorou música', 'alta',
        ${owner.json({ preferencia_reforcador: { item_atividade: "música", valencia: "alta" } })})`;

    const r = await A.aprovarExtracao(ctxT1, {
      extractionId: EX_SEM_NUMERO,
      versao: 1,
    });
    expect(r.ok).toBe(true); // a revisão em si não falha

    const rows =
      await owner`SELECT id FROM reinforcer_profile WHERE extraction_id = ${EX_SEM_NUMERO}`;
    expect(rows.length).toBe(0);
  });
});
