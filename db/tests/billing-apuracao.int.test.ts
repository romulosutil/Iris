/**
 * #36 (Fase 7, Fatia B) — apuração de pacientes ativos por ciclo, contra o banco
 * real. Objeto sob teste: a migração `0071_billing_assinatura_e_ciclo.sql`
 * (função `billing_apurar_ciclo(uuid)` SECURITY DEFINER, função
 * `app_assinatura_bloqueia_cadastro()`, RLS/grants de `subscription`,
 * `billing_cycle` e `billing_cycle_patient`).
 *
 * A regra comercial que este arquivo protege ("paciente ativo no ciclo
 * `[inicio, fim)`") vale se AO MENOS UM critério for verdadeiro:
 *   (a) `patient.criado_em` dentro do ciclo            → `criado_no_ciclo`
 *   (b) interação no ciclo                             → `interacao_no_ciclo`
 *       (sessão agendada/check-in/criada, `evidence.aprovado_em`,
 *        `session_note.criado_em`)
 *   (c) `patient.arquivado_em IS NULL`                 → `ativo_nao_arquivado`
 * Precedência do motivo: (a) > (b) > (c).
 *
 * A consequência que sustenta a fatura: paciente ARQUIVADO e PARADO no ciclo
 * NÃO é cobrado. É o único critério que separa "base histórica" de "base
 * faturável" — se ele quebrar, a clínica paga por prontuário morto e a fatura
 * fica indefensável numa contestação.
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
const P_ATIVO_ANTIGO = "00000000-0000-0000-0000-0000000036d2"; // (c)
const P_ARQ_PARADO = "00000000-0000-0000-0000-0000000036d3"; // NEGATIVA principal
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
const P_B1 = "00000000-0000-0000-0000-0000000036f1";
const P_B2 = "00000000-0000-0000-0000-0000000036f2";

/** Contados esperados na clínica A: 9 (dos 13 pacientes semeados). */
const ESPERADO_A = 9;

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
  return (await owner!<{ patient_id: string; motivo: string }[]>`
    SELECT patient_id, motivo FROM billing_cycle_patient
     WHERE cycle_id = ${cycleId} ORDER BY patient_id`).map((r) => ({
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
    // Criado DENTRO do ciclo (critério a). Ativo, mas o motivo tem que ser
    // `criado_no_ciclo` — a precedência (a) > (c) é parte da regra.
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em) VALUES
      (${P_CRIADO}, ${CLINIC_A}, 'Criado no ciclo', ${DENTRO})`;
    // Ativo criado ANTES, sem nenhuma interação (critério c puro).
    await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em) VALUES
      (${P_ATIVO_ANTIGO}, ${CLINIC_A}, 'Ativo antigo', ${CRIADO_ANTIGO})`;
    // Todos os demais da clínica A são ARQUIVADOS e criados antes do ciclo:
    // assim (a) e (c) estão descartados e só (b) pode contá-los.
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
    // Clínica B: dois pacientes ATIVOS — se o isolamento vazar, eles aparecem
    // na contagem de A (ou A na de B).
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
    // Sessão da clínica B DENTRO do ciclo — vizinho barulhento de propósito.
    await semearSessao({
      id: "00000000-0000-0000-0000-000000036520",
      clinicId: CLINIC_B,
      patientId: P_B1,
      terapeutaId: U_TER_B,
      agendadaPara: DENTRO,
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

  // ─── critérios (a), (b), (c) ──────────────────────────────────────────────
  test("(a) paciente criado dentro do ciclo entra como `criado_no_ciclo`", async () => {
    expect(await motivoDe(CYCLE_A, P_CRIADO)).toBe("criado_no_ciclo");
  });

  test("(c) ativo criado antes, sem interação, entra como `ativo_nao_arquivado`", async () => {
    expect(await motivoDe(CYCLE_A, P_ATIVO_ANTIGO)).toBe("ativo_nao_arquivado");
  });

  test("ARQUIVADO e PARADO no ciclo NÃO é contado (o que sustenta a fatura)", async () => {
    // A negativa central da regra: nenhuma linha no memorial, não "linha com
    // motivo estranho". Se este teste ficar vermelho, a clínica está pagando
    // por prontuário morto.
    expect(await motivoDe(CYCLE_A, P_ARQ_PARADO)).toBeNull();
  });

  test("(b) arquivado COM sessão no ciclo é contado como `interacao_no_ciclo`", async () => {
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
    const doB = await withTenant(ctx("coordenador", U_COORD_B, CLINIC_B), (db) =>
      db.execute(sql`SELECT patient_id FROM billing_cycle_patient`),
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

  // ─── gate de cadastro lido de dentro do produto ───────────────────────────
  test("app_assinatura_bloqueia_cadastro reage ao status da assinatura", async () => {
    const bloqueia = async (clinicId: string, userId: string) => {
      const rows = await withTenant(ctx("coordenador", userId, clinicId), (db) =>
        db.execute(sql`SELECT app_assinatura_bloqueia_cadastro() AS b`),
      );
      return rows[0]!.b as boolean;
    };

    // free_tier (estado do backfill) não bloqueia ninguém.
    expect(await bloqueia(CLINIC_A, U_COORD_A)).toBe(false);

    await owner!`UPDATE subscription SET status = 'setup_pending' WHERE id = ${SUB_A}`;
    expect(await bloqueia(CLINIC_A, U_COORD_A)).toBe(true);

    await owner!`UPDATE subscription SET status = 'active' WHERE id = ${SUB_A}`;
    expect(await bloqueia(CLINIC_A, U_COORD_A)).toBe(false);

    // Clínica isenta (legado) nunca é bloqueada, MESMO em setup_pending.
    expect(await bloqueia(CLINIC_C, U_COORD_C)).toBe(false);

    await owner!`UPDATE subscription SET status = 'free_tier' WHERE id = ${SUB_A}`;
  });
});
