/**
 * #36 (Fase 7, Fatia B) + #163/#159 — apuração de pacientes faturáveis por
 * ciclo, contra o banco real. Objeto sob teste: `billing_apurar_ciclo(uuid)`
 * na versão da migração `0075_billing_pos_pago.sql` (SECURITY DEFINER), mais a
 * função `app_conta_somente_leitura()` da `0073` e a RLS/grants de
 * `subscription`, `billing_cycle` e `billing_cycle_patient` (da `0071`).
 *
 * ## A regra comercial, na versão que vale a partir da 0075
 *
 * Paciente é faturável no ciclo `[inicio, fim)` se AO MENOS UM critério vale:
 *   (a) `patient.criado_em` dentro do ciclo   → `criado_no_ciclo`
 *   (b) interação no ciclo                    → `interacao_no_ciclo`
 *       (sessão agendada/check-in/criada, `evidence.aprovado_em`,
 *        `session_note.criado_em`)
 * Precedência do motivo: (a) > (b).
 *
 * O critério (c) — "`arquivado_em IS NULL`", motivo `ativo_nao_arquivado` —
 * **SAIU**. Havia três definições incompatíveis vivas em produção (esta função,
 * o FAQ público e a query de MRR do backoffice); a decidida é "criou OU
 * interagiu". O valor `ativo_nao_arquivado` continua no enum
 * `billing_motivo_ativo` — `billing_cycle_patient.motivo` é memorial de fatura
 * EMITIDA, e removê-lo reescreveria retroativamente o registro de por que
 * alguém foi cobrado — mas **não é mais PRODUZIDO**. Nenhum caso deste arquivo
 * pode voltar a esperá-lo.
 *
 * ## A consequência aceita conscientemente
 *
 * Clínica em recesso apura 0 e paga R$ 0: um mês sem sessão, check-in, evolução
 * ou cadastro novo zera a fatura, mesmo com 40 pacientes ATIVOS e não
 * arquivados na base. É deliberadamente mais generoso que a regra antiga. A
 * inversão que isso força aqui: paciente não-arquivado e PARADO no ciclo, que
 * antes entrava por (c), agora **não é contado**.
 *
 * O que sustenta a fatura numa contestação passa a ser: toda linha do memorial
 * aponta para um FATO datado dentro do ciclo (um cadastro ou uma interação),
 * nunca para a mera existência de um prontuário.
 *
 * Roda com `pnpm test:rls`. Gate de env em `integration-env.ts` (as três URLs).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

// ─── identificadores fixos, legíveis por issue (#36 = ...0036) ──────────────
const CLINIC_A = "00000000-0000-0000-0000-0000000036aa";
const CLINIC_B = "00000000-0000-0000-0000-0000000036bb";
const CLINIC_C = "00000000-0000-0000-0000-0000000036cc"; // isenta de trial
const U_COORD_A = "00000000-0000-0000-0000-0000000036c1";
const U_TER_A = "00000000-0000-0000-0000-0000000036e1";
const U_COORD_B = "00000000-0000-0000-0000-0000000036c2";
const U_TER_B = "00000000-0000-0000-0000-0000000036e2";
const U_COORD_C = "00000000-0000-0000-0000-0000000036c3";

const SUB_A = "00000000-0000-0000-0000-00000003600a";
const SUB_B = "00000000-0000-0000-0000-00000003600b";
const SUB_C = "00000000-0000-0000-0000-00000003600c";
const CYCLE_A = "00000000-0000-0000-0000-0000000360a1";
const CYCLE_B = "00000000-0000-0000-0000-0000000360b1";

// Ciclo sob teste: [2026-03-01T00:00Z, 2026-04-01T00:00Z)
//
// `Date`, não string: o driver `postgres` descobre pelo ParameterDescription
// que o parâmetro é `timestamptz` e aplica o serializador de data — uma string
// ISO estoura com `RangeError: Invalid time value` antes de chegar no banco.
const INICIO = new Date("2026-03-01T00:00:00Z");
const FIM = new Date("2026-04-01T00:00:00Z");
const ANTES = new Date("2026-02-10T12:00:00Z"); // fora, antes de `inicio`
const DEPOIS = new Date("2026-04-15T12:00:00Z"); // fora, depois de `fim`
const DENTRO = new Date("2026-03-10T12:00:00Z");
const CRIADO_ANTIGO = new Date("2026-01-05T09:00:00Z");

// ─── pacientes da clínica A (o cenário) ─────────────────────────────────────
const P_CRIADO = "00000000-0000-0000-0000-0000000036d1"; // (a)
const P_ATIVO_PARADO = "00000000-0000-0000-0000-0000000036d2"; // NEGATIVA nova (ex-(c))
const P_ARQ_PARADO = "00000000-0000-0000-0000-0000000036d3"; // NEGATIVA histórica
const P_ARQ_SESSAO = "00000000-0000-0000-0000-0000000036d4"; // (b) sessão no ciclo
const P_CH_AGENDADA = "00000000-0000-0000-0000-0000000036d5"; // (b) só agendada_para
const P_CH_CHECKIN = "00000000-0000-0000-0000-0000000036d6"; // (b) só check_in_em
const P_CH_EVIDENCE = "00000000-0000-0000-0000-0000000036d7"; // (b) só evidence
const P_CH_NOTE = "00000000-0000-0000-0000-0000000036d8"; // (b) só session_note
const P_ARQ_ANTES = "00000000-0000-0000-0000-0000000036d9"; // interação antes
const P_ARQ_DEPOIS = "00000000-0000-0000-0000-0000000036da"; // interação depois
const P_BORDA_INICIO = "00000000-0000-0000-0000-0000000036db"; // exatamente `inicio`
const P_BORDA_FIM = "00000000-0000-0000-0000-0000000036dc"; // exatamente `fim`
const P_TRES_SESSOES = "00000000-0000-0000-0000-0000000036dd"; // unicidade

// ─── pacientes da clínica B (o vizinho que não pode contaminar) ─────────────
// Ambos com sessão DENTRO do ciclo: sob o critério novo, "ativo" não basta —
// um vizinho parado apuraria 0 e o teste de isolamento perderia toda a força
// (0 no vizinho é indistinguível de "a RLS não deixou ver nada").
const P_B1 = "00000000-0000-0000-0000-0000000036f1";
const P_B2 = "00000000-0000-0000-0000-0000000036f2";

/**
 * Contados esperados na clínica A: 8 (dos 13 pacientes semeados).
 *
 * Era 9 sob o critério antigo. O que saiu: `P_ATIVO_PARADO`, que entrava
 * só por (c) — não-arquivado e sem nenhum fato datado no ciclo. É exatamente a
 * "clínica em recesso paga R$ 0" em escala de um paciente.
 */
const ESPERADO_A = 8;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

/**
 * Semeia UMA sessão pela role dona. `estado = 'realizada'` de propósito: as
 * exclusion constraints de overbook (`session_no_overbook_*`) só valem para
 * `estado = 'agendada'`, e este arquivo não está testando agenda — sessões
 * "agendadas" empilhadas no mesmo terapeuta fariam o seed estourar por um
 * motivo alheio à regra sob teste.
 */
async function semearSessao(opts: {
  id: string;
  clinicId: string;
  patientId: string;
  terapeutaId: string;
  agendadaPara: Date;
  checkInEm?: Date | null;
  criadoEm: Date;
}) {
  await owner!`
    INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para,
                         check_in_em, criado_em, disciplina, estado)
    VALUES (${opts.id}, ${opts.clinicId}, ${opts.patientId}, ${opts.terapeutaId},
            ${opts.agendadaPara},
            ${opts.checkInEm ?? null},
            ${opts.criadoEm}, 'ABA', 'realizada')`;
}

/** Linhas do memorial de um ciclo, lidas pela role DONA — o oráculo do teste. */
async function memorial(cycleId: string) {
  return (
    await owner!<{ patient_id: string; motivo: string }[]>`
    SELECT patient_id, motivo FROM billing_cycle_patient
     WHERE cycle_id = ${cycleId} ORDER BY patient_id`
  ).map((r) => ({
    patientId: r.patient_id,
    motivo: r.motivo,
  }));
}

/** Motivo com que um paciente entrou no ciclo, ou `null` se NÃO foi contado. */
async function motivoDe(cycleId: string, patientId: string) {
  const [row] = await owner!<{ motivo: string }[]>`
    SELECT motivo FROM billing_cycle_patient
     WHERE cycle_id = ${cycleId} AND patient_id = ${patientId}`;
  return row?.motivo ?? null;
}

/**
 * Fotografa o `arquivado_em` de todos os pacientes de uma clínica e devolve o
 * "desfazer". Os testes do #216 precisam MEXER no arquivamento depois do seed
 * — e o seed é `beforeAll`, compartilhado com todos os outros casos do
 * arquivo. Sem restaurar, um teste de arquivamento mudaria o cenário debaixo
 * dos testes seguintes (a ordem dentro do `describe` é sequencial).
 */
async function snapshotArquivado(clinicId: string) {
  const linhas = await owner!<{ id: string; arquivado_em: Date | null }[]>`
    SELECT id, arquivado_em FROM patient WHERE clinic_id = ${clinicId}`;
  return async () => {
    for (const l of linhas) {
      await owner!`UPDATE patient SET arquivado_em = ${l.arquivado_em}
                    WHERE id = ${l.id}`;
    }
  };
}

/** Executa a apuração pela role dona e devolve o inteiro que a função retorna. */
async function apurar(cycleId: string) {
  const [row] = await owner!<{ n: number }[]>`
    SELECT billing_apurar_ciclo(${cycleId}::uuid) AS n`;
  return row!.n;
}

describe.skipIf(!hasDb)("#36 · apuração de ciclo de faturamento", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;

    await owner!`INSERT INTO clinic (id, nome, isento_trial) VALUES
      (${CLINIC_A}, 'Clínica A #36', false),
      (${CLINIC_B}, 'Clínica B #36', false),
      (${CLINIC_C}, 'Clínica C #36 (isenta)', true)`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@i36.test'),
      (${U_TER_A},   'Ter A',   'ter-a@i36.test'),
      (${U_COORD_B}, 'Coord B', 'coord-b@i36.test'),
      (${U_TER_B},   'Ter B',   'ter-b@i36.test'),
      (${U_COORD_C}, 'Coord C', 'coord-c@i36.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},   ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador'),
      (${U_TER_B},   ${CLINIC_B}, 'terapeuta'),
      (${U_COORD_C}, ${CLINIC_C}, 'coordenador')`;

    // ── pacientes ───────────────────────────────────────────────────────────
    // Criado DENTRO do ciclo (critério a). Também tem interação implícita
    // nenhuma — o motivo tem que ser `criado_no_ciclo`, e a precedência
    // (a) > (b) é parte da regra.
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em) VALUES
      (${P_CRIADO}, ${CLINIC_A}, 'Criado no ciclo', ${DENTRO})`;
    // ATIVO (não arquivado), criado ANTES do ciclo, sem NENHUMA interação
    // dentro dele. Era o critério (c) puro e entrava na fatura; a partir da
    // 0075 é a negativa nova. Deixado explicitamente NÃO arquivado: se o
    // critério (c) ressuscitar, este é o único paciente que volta a contar.
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em) VALUES
      (${P_ATIVO_PARADO}, ${CLINIC_A}, 'Ativo parado', ${CRIADO_ANTIGO})`;
    // Todos os demais da clínica A são ARQUIVADOS e criados antes do ciclo.
    // O arquivamento não decide mais nada na regra — foi mantido de propósito:
    // ele prova que (b) conta INDEPENDENTE do arquivamento, que é o que separa
    // "não faturamos base morta" de "não faturamos ninguém arquivado".
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em, arquivado_em) VALUES
      (${P_ARQ_PARADO},   ${CLINIC_A}, 'Arquivado parado',   ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_ARQ_SESSAO},   ${CLINIC_A}, 'Arquivado c/ sessão',${CRIADO_ANTIGO}, ${ANTES}),
      (${P_CH_AGENDADA},  ${CLINIC_A}, 'Canal agendada',     ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_CH_CHECKIN},   ${CLINIC_A}, 'Canal check-in',     ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_CH_EVIDENCE},  ${CLINIC_A}, 'Canal evidência',    ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_CH_NOTE},      ${CLINIC_A}, 'Canal evolução',     ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_ARQ_ANTES},    ${CLINIC_A}, 'Interação antes',    ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_ARQ_DEPOIS},   ${CLINIC_A}, 'Interação depois',   ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_BORDA_INICIO}, ${CLINIC_A}, 'Borda início',       ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_BORDA_FIM},    ${CLINIC_A}, 'Borda fim',          ${CRIADO_ANTIGO}, ${ANTES}),
      (${P_TRES_SESSOES}, ${CLINIC_A}, 'Três sessões',       ${CRIADO_ANTIGO}, ${ANTES})`;
    // Clínica B: dois pacientes ativos, ambos com sessão no ciclo (semeadas
    // abaixo) — se o isolamento vazar, eles aparecem na contagem de A (ou A na
    // de B).
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em) VALUES
      (${P_B1}, ${CLINIC_B}, 'B um',   ${CRIADO_ANTIGO}),
      (${P_B2}, ${CLINIC_B}, 'B dois', ${CRIADO_ANTIGO})`;

    // ── sessões (canal por canal, sempre isolando UM gatilho) ───────────────
    // Sessão inteiramente dentro do ciclo.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036501",
      clinicId: CLINIC_A,
      patientId: P_ARQ_SESSAO,
      terapeutaId: U_TER_A,
      agendadaPara: DENTRO,
      criadoEm: DENTRO,
    });
    // Só `agendada_para` dentro (criada fora, sem check-in).
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036502",
      clinicId: CLINIC_A,
      patientId: P_CH_AGENDADA,
      terapeutaId: U_TER_A,
      agendadaPara: DENTRO,
      criadoEm: ANTES,
    });
    // Só `check_in_em` dentro (agendada e criada fora — o caso do encaixe).
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036503",
      clinicId: CLINIC_A,
      patientId: P_CH_CHECKIN,
      terapeutaId: U_TER_A,
      agendadaPara: ANTES,
      checkInEm: DENTRO,
      criadoEm: ANTES,
    });
    // Sessões-suporte para evidence/session_note: TODOS os timestamps da
    // própria sessão ficam fora do ciclo, para que o único gatilho possível
    // seja o da tabela filha.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036504",
      clinicId: CLINIC_A,
      patientId: P_CH_EVIDENCE,
      terapeutaId: U_TER_A,
      agendadaPara: ANTES,
      criadoEm: ANTES,
    });
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036505",
      clinicId: CLINIC_A,
      patientId: P_CH_NOTE,
      terapeutaId: U_TER_A,
      agendadaPara: ANTES,
      criadoEm: ANTES,
    });
    // Bordas do intervalo semiaberto.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036506",
      clinicId: CLINIC_A,
      patientId: P_BORDA_INICIO,
      terapeutaId: U_TER_A,
      agendadaPara: INICIO,
      criadoEm: ANTES,
    });
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036507",
      clinicId: CLINIC_A,
      patientId: P_BORDA_FIM,
      terapeutaId: U_TER_A,
      agendadaPara: FIM,
      criadoEm: DEPOIS,
    });
    // Interação estritamente fora, dos dois lados.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036508",
      clinicId: CLINIC_A,
      patientId: P_ARQ_ANTES,
      terapeutaId: U_TER_A,
      agendadaPara: ANTES,
      checkInEm: ANTES,
      criadoEm: ANTES,
    });
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036509",
      clinicId: CLINIC_A,
      patientId: P_ARQ_DEPOIS,
      terapeutaId: U_TER_A,
      agendadaPara: DEPOIS,
      checkInEm: DEPOIS,
      criadoEm: DEPOIS,
    });
    // Três sessões no MESMO ciclo, mesmo paciente → a PK do memorial tem que
    // colapsar isso em uma linha só.
    for (const [i, dia] of [
      new Date("2026-03-03T10:00:00Z"),
      new Date("2026-03-12T10:00:00Z"),
      new Date("2026-03-25T10:00:00Z"),
    ].entries()) {
      await semearSessao({
        id: `00000000-0000-0000-0000-00000003651${i}`,
        clinicId: CLINIC_A,
        patientId: P_TRES_SESSOES,
        terapeutaId: U_TER_A,
        agendadaPara: dia,
        criadoEm: dia,
      });
    }
    // Sessões da clínica B DENTRO do ciclo — vizinho barulhento de propósito.
    // Sob o critério "criou OU interagiu", os DOIS pacientes de B precisam de
    // um fato datado no ciclo para que a contagem esperada de B (2) continue
    // sendo uma afirmação forte.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036520",
      clinicId: CLINIC_B,
      patientId: P_B1,
      terapeutaId: U_TER_B,
      agendadaPara: DENTRO,
      criadoEm: DENTRO,
    });
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036521",
      clinicId: CLINIC_B,
      patientId: P_B2,
      terapeutaId: U_TER_B,
      agendadaPara: new Date("2026-03-18T14:00:00Z"),
      criadoEm: DENTRO,
    });

    // ── evidence (canal 3): exige extraction + session ─────────────────────
    const EXTRACTION = "00000000-0000-0000-0000-000000036e01";
    await owner!`
      INSERT INTO extraction (id, session_id, clinic_id, subtipo, trecho_fonte,
                              confianca, payload, criado_em)
      VALUES (${EXTRACTION}, '00000000-0000-0000-0000-000000036504', ${CLINIC_A},
              'evidencia', 'trecho de teste #36', 'alta', '{}'::jsonb,
              ${ANTES})`;
    await owner!`
      INSERT INTO evidence (id, extraction_id, patient_id, session_id,
                            session_numero, alvo_ordinal, classificacao_original,
                            aprovado_por, aprovado_em)
      VALUES ('00000000-0000-0000-0000-000000036e02', ${EXTRACTION},
              ${P_CH_EVIDENCE}, '00000000-0000-0000-0000-000000036504',
              1, 1, '{}'::jsonb, ${U_TER_A}, ${DENTRO})`;

    // ── session_note (canal 4) ─────────────────────────────────────────────
    await owner!`
      INSERT INTO session_note (id, session_id, clinic_id, tipo, texto, autor_id,
                                criado_em)
      VALUES ('00000000-0000-0000-0000-000000036e03',
              '00000000-0000-0000-0000-000000036505', ${CLINIC_A},
              'nota_consolidada', 'evolução de teste #36', ${U_TER_A},
              ${DENTRO})`;

    // ── assinaturas e ciclos ───────────────────────────────────────────────
    await owner!`INSERT INTO subscription (id, clinic_id, status) VALUES
      (${SUB_A}, ${CLINIC_A}, 'free_tier'),
      (${SUB_B}, ${CLINIC_B}, 'active'),
      (${SUB_C}, ${CLINIC_C}, 'setup_pending')`;
    await owner!`INSERT INTO billing_cycle (id, clinic_id, subscription_id, inicio, fim) VALUES
      (${CYCLE_A}, ${CLINIC_A}, ${SUB_A}, ${INICIO}, ${FIM}),
      (${CYCLE_B}, ${CLINIC_B}, ${SUB_B}, ${INICIO}, ${FIM})`;

    await apurar(CYCLE_A);
  });

  afterAll(async () => {
    await owner?.end();
  });

  // ─── critérios (a) e (b) ─────────────────────────────────────────────────
  test("(a) paciente criado dentro do ciclo entra como `criado_no_ciclo`", async () => {
    expect(await motivoDe(CYCLE_A, P_CRIADO)).toBe("criado_no_ciclo");
  });

  test("ATIVO e PARADO no ciclo NÃO é contado (é a clínica em recesso pagando R$ 0)", async () => {
    // A INVERSÃO da 0075. Este paciente está vivo, não arquivado, e sob o
    // critério antigo entrava por (c) como `ativo_nao_arquivado`. Agora a mera
    // existência do prontuário não gera fatura: sem cadastro nem interação
    // datada no ciclo, não há o que cobrar.
    //
    // A consequência foi aceita conscientemente: um mês de recesso zera a
    // fatura inteira de uma clínica com a base cheia.
    expect(await motivoDe(CYCLE_A, P_ATIVO_PARADO)).toBeNull();
  });

  test("`ativo_nao_arquivado` não é PRODUZIDO por nenhuma linha do memorial", async () => {
    // Trava de regressão do enum: o valor continua existindo (memorial de
    // faturas antigas), então uma volta acidental do critério (c) não daria
    // erro de tipo — passaria despercebida linha a linha. Esta asserção é
    // sobre o ciclo INTEIRO, não sobre um paciente.
    const motivos = (await memorial(CYCLE_A)).map((l) => l.motivo);
    expect(motivos).not.toContain("ativo_nao_arquivado");
    expect(new Set(motivos)).toEqual(
      new Set(["criado_no_ciclo", "interacao_no_ciclo"]),
    );
  });

  test("ARQUIVADO e PARADO no ciclo NÃO é contado", async () => {
    // Nenhuma linha no memorial, não "linha com motivo estranho". Continua
    // valendo pelo critério novo — só que agora pelo mesmo motivo de qualquer
    // outro parado: falta de fato datado, não o arquivamento em si.
    expect(await motivoDe(CYCLE_A, P_ARQ_PARADO)).toBeNull();
  });

  test("(b) arquivado COM sessão no ciclo é contado como `interacao_no_ciclo`", async () => {
    // O espelho do caso acima: arquivar NÃO isenta. Quem teve atendimento no
    // ciclo é faturado, tenha sido arquivado depois ou não.
    expect(await motivoDe(CYCLE_A, P_ARQ_SESSAO)).toBe("interacao_no_ciclo");
  });

  // ─── cada canal de interação, isolado ─────────────────────────────────────
  test("canal `session.agendada_para` sozinho conta", async () => {
    expect(await motivoDe(CYCLE_A, P_CH_AGENDADA)).toBe("interacao_no_ciclo");
  });

  test("canal `session.check_in_em` sozinho conta (encaixe fora da agenda)", async () => {
    expect(await motivoDe(CYCLE_A, P_CH_CHECKIN)).toBe("interacao_no_ciclo");
  });

  test("canal `evidence.aprovado_em` sozinho conta", async () => {
    expect(await motivoDe(CYCLE_A, P_CH_EVIDENCE)).toBe("interacao_no_ciclo");
  });

  test("canal `session_note.criado_em` sozinho conta", async () => {
    expect(await motivoDe(CYCLE_A, P_CH_NOTE)).toBe("interacao_no_ciclo");
  });

  // ─── fora do intervalo, dos DOIS lados ────────────────────────────────────
  test("interação ANTES de `inicio` não conta", async () => {
    expect(await motivoDe(CYCLE_A, P_ARQ_ANTES)).toBeNull();
  });

  test("interação DEPOIS de `fim` não conta", async () => {
    expect(await motivoDe(CYCLE_A, P_ARQ_DEPOIS)).toBeNull();
  });

  // ─── bordas do intervalo semiaberto [inicio, fim) ─────────────────────────
  test("interação exatamente em `inicio` CONTA (intervalo fechado à esquerda)", async () => {
    expect(await motivoDe(CYCLE_A, P_BORDA_INICIO)).toBe("interacao_no_ciclo");
  });

  test("interação exatamente em `fim` NÃO conta (intervalo aberto à direita)", async () => {
    // Sem isso, o instante de virada seria faturado nos DOIS ciclos vizinhos.
    expect(await motivoDe(CYCLE_A, P_BORDA_FIM)).toBeNull();
  });

  // ─── unicidade e idempotência ─────────────────────────────────────────────
  test("três sessões no ciclo geram UMA linha no memorial", async () => {
    const linhas = (await memorial(CYCLE_A)).filter(
      (l) => l.patientId === P_TRES_SESSOES,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.motivo).toBe("interacao_no_ciclo");
  });

  test("apurar duas vezes converge: mesma contagem, sem duplicar memorial", async () => {
    const primeira = await apurar(CYCLE_A);
    const memorial1 = await memorial(CYCLE_A);
    const segunda = await apurar(CYCLE_A);
    const memorial2 = await memorial(CYCLE_A);

    expect(primeira).toBe(ESPERADO_A);
    expect(segunda).toBe(primeira);
    expect(memorial2).toEqual(memorial1);
    expect(memorial2).toHaveLength(ESPERADO_A);
  });

  // ─── #216 · a apuração é CONGELADA (arquivar depois não reescreve o ciclo) ─
  //
  // Trava de regressão do #216. A issue pedia "congelar o critério (c) de
  // paciente ativo no fim do ciclo" e sugeria o fix literal
  // `arquivado_em IS NULL OR arquivado_em >= v_fim` dentro de
  // `billing_apurar_ciclo`. Aplicar isso HOJE seria REGRESSÃO, não correção:
  // a `0075` fez `CREATE OR REPLACE` e removeu QUALQUER leitura de
  // `arquivado_em` da função (DECISÃO 8 de 04/08/2026 — ver
  // `docs/produto/modelo-de-negocio.md`), e o predicado sugerido reintroduz o
  // critério (c) por uma porta lateral: passaria a EXCLUIR quem foi arquivado
  // DENTRO do ciclo, mesmo tendo sido atendido nele.
  //
  // A propriedade que a issue realmente queria continua valendo — e é o que
  // estes testes travam: o resultado da apuração de um ciclo não depende do
  // INSTANTE em que o job roda. Isso já é verdade sem nenhum `arquivado_em` no
  // SQL, justamente porque o predicado só olha fatos DATADOS em
  // `[inicio, fim)`. O arquivamento é um fato de HOJE; o ciclo é história.
  //
  // A negativa que prova que (c) não voltou (não-arquivado e PARADO não é
  // contado) já está travada acima — ver "ATIVO e PARADO no ciclo NÃO é
  // contado" e "`ativo_nao_arquivado` não é PRODUZIDO". Não é duplicada aqui.
  test("arquivar DEPOIS do fim do ciclo não muda o ciclo já apurado (#216)", async () => {
    // O cenário exato do #216: a varredura de 90 dias (#174) arquiva em massa
    // HOJE, e o job de faturamento reapura um ciclo de março. Se `arquivado_em`
    // estivesse no predicado como filtro, a fatura de março seria reescrita
    // retroativamente para R$ 0 — a mesma linha do memorial mudaria de valor
    // dependendo da hora em que alguém rodou o job.
    const memorialAntes = await memorial(CYCLE_A);
    const nAntes = await apurar(CYCLE_A);
    const restaurar = await snapshotArquivado(CLINIC_A);

    try {
      await owner!`UPDATE patient SET arquivado_em = now()
                    WHERE clinic_id = ${CLINIC_A}`;

      const nDepois = await apurar(CYCLE_A);
      expect(nDepois).toBe(nAntes);
      expect(nDepois).toBe(ESPERADO_A);
      expect(await memorial(CYCLE_A)).toEqual(memorialAntes);
    } finally {
      // `finally`, não linha solta no fim: a asserção que falha aborta o teste
      // ANTES de restaurar, e o seed é `beforeAll` compartilhado — sem isto,
      // uma falha aqui contaminaria em cascata todos os testes seguintes e
      // esconderia a causa real atrás de vermelhos derivados.
      await restaurar();
    }
  });

  test("arquivar DENTRO do ciclo não isenta quem foi atendido nele", async () => {
    // Este é o caso que o fix literal do #216 quebraria e o anterior não pega:
    // com `arquivado_em >= v_fim`, um arquivamento em 10/03 (dentro do ciclo,
    // portanto < `fim`) reprovaria no predicado e o paciente sumiria da fatura
    // — apesar de ter tido sessão, check-in ou evolução naquele mesmo mês.
    // Quem consumiu atendimento no ciclo é faturado; a data em que a clínica
    // decidiu encerrar o prontuário é irrelevante para o que já aconteceu.
    const memorialAntes = await memorial(CYCLE_A);
    const restaurar = await snapshotArquivado(CLINIC_A);

    try {
      await owner!`UPDATE patient SET arquivado_em = ${DENTRO}
                    WHERE clinic_id = ${CLINIC_A}`;

      expect(await apurar(CYCLE_A)).toBe(ESPERADO_A);
      expect(await memorial(CYCLE_A)).toEqual(memorialAntes);
      expect(await motivoDe(CYCLE_A, P_ARQ_SESSAO)).toBe("interacao_no_ciclo");
    } finally {
      await restaurar();
    }
  });

  test("o memorial independe do valor de `arquivado_em` (as 4 posições)", async () => {
    // A forma mais forte da propriedade: varrer `arquivado_em` por todas as
    // posições relativas ao ciclo e exigir memorial IDÊNTICO em todas. Qualquer
    // menção a `arquivado_em` no predicado — nas duas direções, como filtro
    // conjuntivo (`IS NULL`) ou como critério disjuntivo (o antigo (c)) —
    // muda o resultado em pelo menos uma destas posições e derruba o teste.
    //
    // A posição "antes de `inicio`" é o estado de seed da maioria dos
    // pacientes de A, já exercitado por "(b) arquivado COM sessão no ciclo é
    // contado"; aqui ela entra só para fechar a varredura.
    const esperado = await memorial(CYCLE_A);
    const restaurar = await snapshotArquivado(CLINIC_A);

    try {
      for (const [rotulo, valor] of [
        ["nunca arquivado (NULL)", null],
        ["arquivado antes de `inicio`", ANTES],
        ["arquivado dentro do ciclo", DENTRO],
        ["arquivado depois de `fim`", DEPOIS],
      ] as const) {
        await owner!`UPDATE patient SET arquivado_em = ${valor}
                      WHERE clinic_id = ${CLINIC_A}`;
        expect(await apurar(CYCLE_A), rotulo).toBe(ESPERADO_A);
        expect(await memorial(CYCLE_A), rotulo).toEqual(esperado);
      }
    } finally {
      await restaurar();
    }
  });

  // ─── isolamento cross-tenant (o caso mais caro de errar) ──────────────────
  test("clínica vizinha com pacientes ativos não altera a contagem de A", async () => {
    const antes = await apurar(CYCLE_A);
    const b = await apurar(CYCLE_B);
    const depois = await apurar(CYCLE_A);

    expect(antes).toBe(ESPERADO_A);
    expect(b).toBe(2); // P_B1 e P_B2, e SÓ eles
    expect(depois).toBe(ESPERADO_A);

    // Nenhum id de A no memorial de B, e vice-versa.
    const idsB = (await memorial(CYCLE_B)).map((l) => l.patientId);
    expect(idsB.sort()).toEqual([P_B1, P_B2].sort());
    const idsA = (await memorial(CYCLE_A)).map((l) => l.patientId);
    expect(idsA).not.toContain(P_B1);
    expect(idsA).not.toContain(P_B2);

    // O `clinic_id` gravado no memorial é o do ciclo, não o de quem chamou.
    const [row] = await owner!<{ n: number }[]>`
      SELECT count(*)::int AS n FROM billing_cycle_patient
       WHERE cycle_id = ${CYCLE_A} AND clinic_id <> ${CLINIC_A}`;
    expect(row!.n).toBe(0);
  });

  // ─── efeito colateral em `billing_cycle` ──────────────────────────────────
  test("a apuração fecha o ciclo: contagem, `apurado_em` e status `apurado`", async () => {
    const retorno = await apurar(CYCLE_A);
    const [ciclo] = await owner!<
      { pacientes_contados: number; apurado_em: Date | null; status: string }[]
    >`SELECT pacientes_contados, apurado_em, status FROM billing_cycle
       WHERE id = ${CYCLE_A}`;
    expect(ciclo!.pacientes_contados).toBe(retorno);
    expect(ciclo!.pacientes_contados).toBe(ESPERADO_A);
    expect(ciclo!.apurado_em).not.toBeNull();
    expect(ciclo!.status).toBe("apurado");
  });

  test("ciclo inexistente estoura (não devolve 0 em silêncio)", async () => {
    // 0 mudo seria pior que o erro: o job fecharia um ciclo fantasma com
    // fatura zerada e ninguém saberia que o id estava errado.
    await expect(
      apurar("00000000-0000-0000-0000-0000000036ff"),
    ).rejects.toThrow();
  });

  // ─── RLS e privilégio para `app_role` ─────────────────────────────────────
  test("clínica LÊ a própria subscription e o próprio billing_cycle", async () => {
    const subs = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT id, clinic_id FROM subscription`),
    );
    expect(subs.map((r) => r.id)).toEqual([SUB_A]);

    const ciclos = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT id FROM billing_cycle`),
    );
    expect(ciclos.map((r) => r.id)).toEqual([CYCLE_A]);
  });

  test("clínica NÃO enxerga billing da outra clínica (0 linhas nas três tabelas)", async () => {
    // SELECT sem predicado de clinic_id: é a RLS que tem que filtrar, não a
    // query. Buscar pelo id do vizinho esconderia uma policy ausente.
    const [subs, ciclos, memoriais] = await withTenant(
      ctx("coordenador", U_COORD_A),
      async (db) => [
        await db.execute(
          sql`SELECT id FROM subscription WHERE clinic_id = ${CLINIC_B}::uuid`,
        ),
        await db.execute(
          sql`SELECT id FROM billing_cycle WHERE clinic_id = ${CLINIC_B}::uuid`,
        ),
        await db.execute(
          sql`SELECT patient_id FROM billing_cycle_patient WHERE cycle_id = ${CYCLE_B}::uuid`,
        ),
      ],
    );
    expect(subs).toHaveLength(0);
    expect(ciclos).toHaveLength(0);
    expect(memoriais).toHaveLength(0);

    // E a clínica B enxerga o dela — o isolamento não é cegueira geral.
    const doB = await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (db) => db.execute(sql`SELECT patient_id FROM billing_cycle_patient`),
    );
    expect(doB.map((r) => r.patient_id).sort()).toEqual([P_B1, P_B2].sort());
  });

  test("app_role NÃO consegue escrever em subscription (sem GRANT de UPDATE)", async () => {
    let rejeitou = false;
    let mensagem = "";
    try {
      await withTenant(ctx("coordenador", U_COORD_A), (db) =>
        db.execute(sql`UPDATE subscription SET status = 'active'`),
      );
    } catch (e) {
      rejeitou = true;
      // Só o FATO da rejeição é asserido: o texto exato do erro é detalhe do
      // Postgres/driver e mudaria o teste de vermelho por uma versão nova.
      mensagem =
        ((e as Error).cause as Error | undefined)?.message ??
        (e as Error).message;
    }
    expect(rejeitou).toBe(true);
    expect(mensagem).not.toBe("");

    // O que importa de verdade: o status não mudou. Um UPDATE barrado por RLS
    // (em vez de por grant) afetaria 0 linhas EM SILÊNCIO — o `rejeitou`
    // acima é o que distingue os dois casos.
    const [sub] = await owner!<{ status: string }[]>`
      SELECT status FROM subscription WHERE id = ${SUB_A}`;
    expect(sub!.status).toBe("free_tier");
  });

  // ─── estado da conta lido de dentro do produto ────────────────────────────
  test("app_conta_somente_leitura reage ao trial e ao status da assinatura", async () => {
    // Substitui a antiga asserção sobre `app_assinatura_bloqueia_cadastro()`
    // (0071), marcada OBSOLETA pela 0073: aquela função nunca foi chamada por
    // código de aplicação, trigger ou CHECK — a única referência viva era este
    // teste, o que a tornava uma barreira que só existia na suíte.
    //
    // A SEMÂNTICA INVERTEU de eixo junto com a política comercial:
    //   antes → "bloqueia CADASTRO enquanto a assinatura não estiver de pé";
    //   agora → "a conta inteira está em SOMENTE-LEITURA" (true = trancada
    //           para escrita clínica; leitura e exportação seguem livres).
    // Cobertura de escrita real (o trigger estourando) fica em
    // `conta-somente-leitura-rls.int.test.ts`; aqui é só o veredito lido pelo
    // produto, pela role de app e com a RLS ligada.
    const somenteLeitura = async (clinicId: string, userId: string) => {
      const rows = await withTenant(
        ctx("coordenador", userId, clinicId),
        (db) => db.execute(sql`SELECT app_conta_somente_leitura() AS ro`),
      );
      return rows[0]!.ro as boolean;
    };

    // Clínica recém-criada (o seed roda agora, `trial_comeco_em` NULL): dentro
    // do teto de 14 dias, escreve normalmente. É o estado do 1º minuto de vida
    // da conta — se ISTO for true, o onboarding inteiro está quebrado.
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(false);

    // Trial iniciado há 90 dias e nenhuma assinatura de pé → somente-leitura.
    await owner!`UPDATE clinic SET trial_comeco_em = now() - interval '90 days'
                  WHERE id = ${CLINIC_A}`;
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(true);

    // `setup_pending` NÃO é assinatura ativa: quem começou a assinar e não
    // terminou continua trancado. (Sob a regra antiga era este o estado que
    // "bloqueava o cadastro" mesmo com trial vigente — a inversão do eixo.)
    await owner!`UPDATE subscription SET status = 'setup_pending' WHERE id = ${SUB_A}`;
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(true);

    // `active` destrava — é a saída do bloqueio.
    await owner!`UPDATE subscription SET status = 'active' WHERE id = ${SUB_A}`;
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(false);

    // `past_due` também destrava: inadimplência é régua de cobrança, não perda
    // de acesso ao prontuário.
    await owner!`UPDATE subscription SET status = 'past_due' WHERE id = ${SUB_A}`;
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(false);

    // `canceled` tranca mesmo com o trial nominalmente vigente — sem isso,
    // cancelar e reassinar renovaria o trial indefinidamente.
    await owner!`UPDATE clinic SET trial_comeco_em = now() WHERE id = ${CLINIC_A}`;
    await owner!`UPDATE subscription SET status = 'canceled' WHERE id = ${SUB_A}`;
    expect(await somenteLeitura(CLINIC_A, U_COORD_A)).toBe(true);

    // Clínica isenta (legado/cortesia) nunca entra em somente-leitura, mesmo
    // com trial vencido e assinatura em `setup_pending`.
    await owner!`UPDATE clinic SET trial_comeco_em = now() - interval '90 days'
                  WHERE id = ${CLINIC_C}`;
    expect(await somenteLeitura(CLINIC_C, U_COORD_C)).toBe(false);

    // Restaura o estado do seed (outros testes deste arquivo leem `SUB_A`).
    await owner!`UPDATE subscription SET status = 'free_tier' WHERE id = ${SUB_A}`;
    await owner!`UPDATE clinic SET trial_comeco_em = NULL
                  WHERE id IN (${CLINIC_A}, ${CLINIC_C})`;
  });
});
