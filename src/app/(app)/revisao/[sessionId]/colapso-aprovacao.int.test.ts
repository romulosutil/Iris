/**
 * T07 — Aprovação em um gesto (spec.md R-07, R-10, R-11; docs/ux/
 * jornada-sessao-unificada.md §3.5). Reabertura ("Reabrir revisão") está
 * CORTADA desta feature (P2, issue #522, opção a) — nenhum teste aqui cobre
 * ou espera esse gesto.
 *
 * Prova, contra o banco real:
 *  - coordenador === terapeuta da sessão (podeAutoValidar=true) + fricção
 *    baixa → aprovar grava EXATAMENTE 1 `evidence_revision` (o carimbo
 *    único), sem exigir justificativa.
 *  - mesmo colapso + fricção ALTA (inconsistente com histórico) → sem
 *    justificativa, a aprovação inteira é recusada (nem a extração
 *    transiciona, nem `evidence`/`evidence_revision` nascem) — R-10 nunca é
 *    dispensado pelo colapso. Com justificativa, aprova e grava 1
 *    `evidence_revision` com essa justificativa.
 *  - terapeuta puro (não coordenador) aprovando a PRÓPRIA sessão
 *    (podeAutoValidar=false, R-07/R-08 — nada é derivado de contagem de
 *    clínica) → fluxo de dois passos intacto: aprovar grava `evidence`, mas
 *    ZERO `evidence_revision` (só nasceria na segunda visita, em
 *    /validacao). `extraction_update` (RLS) só libera o terapeuta dono da
 *    sessão de qualquer forma — coordenador não aprova extração alheia por
 *    esta rota, então esse é o cenário real de "colapso desligado".
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

const CLINIC = "00000000-0000-0000-0000-0000000000f2";
// coordenador que atende esta sessão (colapso ativo)
const COORD_DONO = "00000000-0000-0000-0000-0000000072f1";
// coordenador revisando sessão de OUTRO terapeuta (colapso inativo)
const OUTRO_TERAPEUTA = "00000000-0000-0000-0000-0000000073f1";
const PAC = "00000000-0000-0000-0000-00000000acf2";
const PROTOCOL = "00000000-0000-0000-0000-000000010002";
const GOAL = "00000000-0000-0000-0000-000000020002";

const SESS_PROPRIA = "00000000-0000-0000-0000-00000005e2f1"; // terapeuta = COORD_DONO
const SESS_ALHEIA = "00000000-0000-0000-0000-00000005e2f2"; // terapeuta = OUTRO_TERAPEUTA

const EX_BAIXA = "00000000-0000-0000-0000-00000e0b0001"; // fricção baixa (confiança alta, consistente)
const EX_ALTA = "00000000-0000-0000-0000-00000e0b0002"; // fricção alta (inconsistente com histórico)
const EX_ALHEIA = "00000000-0000-0000-0000-00000e0b0003"; // sessão de outro terapeuta, fricção baixa

const ctxCoordDono = {
  clinicId: CLINIC,
  userId: COORD_DONO,
  role: "coordenador",
} as const;

// `extraction_update` (RLS, db/migrations/0053) só libera o terapeuta DONO da
// sessão — nem coordenador aprova extração de sessão alheia por esta rota.
// O caso "podeAutoValidar=false" relevante aqui é o terapeuta puro aprovando
// a PRÓPRIA sessão (nunca colapsa, R-07/R-08): fluxo de dois passos intacto,
// zero `evidence_revision` — só nasceria numa segunda visita a /validacao.
const ctxOutroTerapeuta = {
  clinicId: CLINIC,
  userId: OUTRO_TERAPEUTA,
  role: "terapeuta",
} as const;

// #553 — forma FLAT, a canônica da coluna `extraction.payload`: é o objeto do
// subtipo já desembrulhado, que é o que os três providers e o seed de demo
// gravam (`payloadDoSubtipo` devolve `e.evidencia`, não `{evidencia: …}`).
// Medição em produção 03/09/2026: 310 de 310 extrações `evidencia` com
// `payload ? 'evidencia'` = false. Este fixture nasceu aninhado e por isso
// nunca exercitou o caminho real — foi essa forma de fixture que escondeu a
// deriva da #532/#533 até a aprovação gerar zero `evidence` em silêncio.
function alvoPayload(descricao: string) {
  return {
    descricao,
    funcao: "mando",
    alvos: [{ goal_id: GOAL, protocol_id: "vbmapp", dominio_id: "mando" }],
  };
}

let owner: ReturnType<typeof postgres>;
let appSql: typeof import("@/db/client").sql;
let A: typeof import("./logic");

async function seed() {
  await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership,
    session, extraction, evidence, evidence_revision, protocol, patient_protocol, goal, milestone
    RESTART IDENTITY CASCADE`;

  await owner`INSERT INTO protocol_familia_catalogo (id, nome) VALUES
    ('vbmapp', 'VB-MAPP') ON CONFLICT (id) DO NOTHING`;

  await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica colapso T07')`;
  await owner`INSERT INTO app_user (id, email, name) VALUES
    (${COORD_DONO}, 'coord.dono@t.com', 'Coordenadora dona'),
    (${OUTRO_TERAPEUTA}, 'outro.terapeuta@t.com', 'Outro terapeuta')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${COORD_DONO}, ${CLINIC}, 'coordenador'),
    (${OUTRO_TERAPEUTA}, ${CLINIC}, 'terapeuta')`;
  await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PAC}, ${CLINIC}, 'Paciente T07')`;
  await owner`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe) VALUES
    (${PAC}, ${COORD_DONO}, 'ABA', 'coordenador_referencia'),
    (${PAC}, ${OUTRO_TERAPEUTA}, 'ABA', 'terapeuta_referencia')`;

  await owner`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, numero_sequencial_paciente, disciplina) VALUES
    (${SESS_PROPRIA}, ${CLINIC}, ${PAC}, ${COORD_DONO}, now(), 'realizada', 1, 'aba'),
    (${SESS_ALHEIA}, ${CLINIC}, ${PAC}, ${OUTRO_TERAPEUTA}, now(), 'realizada', 2, 'aba')`;

  await owner`INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
    (${PROTOCOL}, ${CLINIC}, 'VB-MAPP', 'ABA', 'vbmapp')`;
  await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por) VALUES
    (${PAC}, ${PROTOCOL}, ${COORD_DONO})`;
  await owner`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por) VALUES
    (${GOAL}, ${PAC}, ${CLINIC}, 'Meta de mando', ${owner.json({ tipo: "percentual", valor: 80 })}, ${COORD_DONO})`;

  await owner`INSERT INTO extraction
      (id, session_id, clinic_id, estado, subtipo, trecho_fonte, confianca, inconsistente_com_historico, payload) VALUES
    (${EX_BAIXA}, ${SESS_PROPRIA}, ${CLINIC}, 'sugerida', 'evidencia', 'pediu suco', 'alta', false,
      ${owner.json(alvoPayload("pediu suco"))}),
    (${EX_ALTA}, ${SESS_PROPRIA}, ${CLINIC}, 'sugerida', 'evidencia', 'puxou a mão pedindo bola', 'alta', true,
      ${owner.json(alvoPayload("puxou a mão pedindo bola"))}),
    (${EX_ALHEIA}, ${SESS_ALHEIA}, ${CLINIC}, 'sugerida', 'evidencia', 'apontou pro copo', 'alta', false,
      ${owner.json(alvoPayload("apontou pro copo"))})`;
}

describe.skipIf(!hasDb)("colapso da aprovação — T07 (R-07, R-10, R-11)", () => {
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

  test("fricção BAIXA + coordenador dono da sessão (colapsa) → aprova e grava 1 evidence_revision, sem justificativa", async () => {
    const r = await A.aprovarExtracao(ctxCoordDono, {
      extractionId: EX_BAIXA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const evid =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_BAIXA}`;
    expect(evid.length).toBe(1);

    const rev =
      await owner`SELECT acao, autor_id, justificativa FROM evidence_revision WHERE evidence_id = ${evid[0]!.id}`;
    expect(rev.length).toBe(1);
    expect(rev[0]!.acao).toBe("confirmar");
    expect(rev[0]!.autor_id).toBe(COORD_DONO);
  });

  test("fricção ALTA + colapso, SEM justificativa → aprovação inteira recusada, nada é gravado", async () => {
    const r = await A.aprovarExtracao(ctxCoordDono, {
      extractionId: EX_ALTA,
      versao: 1,
    });
    expect(r.ok).toBeFalsy();
    expect(r.error).toBeTruthy();

    const extracao =
      await owner`SELECT estado FROM extraction WHERE id = ${EX_ALTA}`;
    expect(extracao[0]!.estado).toBe("sugerida");

    const evid =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_ALTA}`;
    expect(evid.length).toBe(0);
  });

  test("fricção ALTA + colapso, COM justificativa → aprova e grava 1 evidence_revision com a justificativa, sem lote", async () => {
    const r = await A.aprovarExtracao(ctxCoordDono, {
      extractionId: EX_ALTA,
      versao: 1,
      justificativaColapso:
        "Revisei o histórico: consistente com a regressão observada em campo.",
    });
    expect(r.ok).toBe(true);

    const evid =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_ALTA}`;
    expect(evid.length).toBe(1);

    const rev =
      await owner`SELECT acao, justificativa FROM evidence_revision WHERE evidence_id = ${evid[0]!.id}`;
    expect(rev.length).toBe(1);
    expect(rev[0]!.acao).toBe("confirmar");
    expect(rev[0]!.justificativa).toBe(
      "Revisei o histórico: consistente com a regressão observada em campo.",
    );
  });

  test("terapeuta puro aprovando a própria sessão (não colapsa, R-07/R-08) → aprova, grava evidence, ZERO evidence_revision", async () => {
    const r = await A.aprovarExtracao(ctxOutroTerapeuta, {
      extractionId: EX_ALHEIA,
      versao: 1,
    });
    expect(r.ok).toBe(true);

    const evid =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_ALHEIA}`;
    expect(evid.length).toBe(1);

    const rev =
      await owner`SELECT id FROM evidence_revision WHERE evidence_id = ${evid[0]!.id}`;
    expect(rev.length).toBe(0);
  });

  test("re-aprovar (idempotência) não duplica evidence_revision", async () => {
    const r1 = await A.aprovarExtracao(ctxCoordDono, {
      extractionId: EX_BAIXA,
      versao: 1,
    });
    expect(r1.ok).toBe(true);

    // 2ª chamada: extração já não é mais 'sugerida' → CAS não acha a linha,
    // não reexecuta inserção de evidence nem de evidence_revision.
    const r2 = await A.aprovarExtracao(ctxCoordDono, {
      extractionId: EX_BAIXA,
      versao: 1,
    });
    expect(r2.ok).toBeFalsy();

    const evid =
      await owner`SELECT id FROM evidence WHERE extraction_id = ${EX_BAIXA}`;
    expect(evid.length).toBe(1);
    const rev =
      await owner`SELECT id FROM evidence_revision WHERE evidence_id = ${evid[0]!.id}`;
    expect(rev.length).toBe(1);
  });
});
