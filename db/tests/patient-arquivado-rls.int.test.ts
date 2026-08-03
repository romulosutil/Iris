/**
 * #174 — `patient.arquivado_em` (arquivamento COMERCIAL) sob RLS real.
 *
 * O que este arquivo protege, nas palavras da issue:
 *   * regra 1/3 — `alta_em` (clínica) e `arquivado_em` (comercial) são
 *     independentes: arquivar NUNCA dá alta;
 *   * regra 2 — dar alta arquiva sozinho, via trigger `patient_alta_arquiva_trg`
 *     (migração 0065). A regra é do BANCO, não do código — então o teste é
 *     contra o banco;
 *   * regra 4 — arquivado continua 100% legível: arquivamento é filtro de UI e
 *     de faturamento, JAMAIS de RLS;
 *   * multi-tenant — a coluna nova não abriu brecha cross-clínica.
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

const CLINIC_A = "00000000-0000-0000-0000-0000000174aa";
const CLINIC_B = "00000000-0000-0000-0000-0000000174bb";
const U_COORD_A = "00000000-0000-0000-0000-0000000174c1";
const U_TER_A = "00000000-0000-0000-0000-0000000174e1";
const U_COORD_B = "00000000-0000-0000-0000-0000000174c2";

const P_ARQUIVADO = "00000000-0000-0000-0000-0000000174d1";
const P_ATIVO = "00000000-0000-0000-0000-0000000174d2";
const P_ALTA = "00000000-0000-0000-0000-0000000174d3";
const P_SO_ARQUIVA = "00000000-0000-0000-0000-0000000174d4";
const P_OUTRA_CLINICA = "00000000-0000-0000-0000-0000000174d9";
// Regra 6 — pacientes dedicados para não acoplar ao estado dos casos acima.
const P_R6_EQUIPE = "00000000-0000-0000-0000-0000000174d7"; // arquivado, U_TER_A na equipe
const P_R6_FORA = "00000000-0000-0000-0000-0000000174d8"; // arquivado, U_TER_A fora da equipe
const P_R6_ATIVO = "00000000-0000-0000-0000-0000000174da"; // NÃO arquivado, U_TER_A na equipe

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

/** Lê o par (alta_em, arquivado_em) pela role DONA — o oráculo do teste. */
async function estado(patientId: string) {
  const [row] = await owner!<
    // `alta_em` é `date` (o driver devolve string); `arquivado_em` é
    // `timestamptz` (devolve `Date`).
    { alta_em: string | null; arquivado_em: Date | null }[]
  >`SELECT alta_em, arquivado_em FROM patient WHERE id = ${patientId}`;
  return row!;
}

describe.skipIf(!hasDb)("#174 · patient.arquivado_em sob RLS", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #174'), (${CLINIC_B}, 'Clínica B #174')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@i174.test'),
      (${U_TER_A},   'Ter A',   'ter-a@i174.test'),
      (${U_COORD_B}, 'Coord B', 'coord-b@i174.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},   ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome, arquivado_em) VALUES
      (${P_ARQUIVADO}, ${CLINIC_A}, 'Arquivado', now())`;
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P_ATIVO},        ${CLINIC_A}, 'Ativo'),
      (${P_ALTA},         ${CLINIC_A}, 'Vai receber alta'),
      (${P_SO_ARQUIVA},   ${CLINIC_A}, 'Só arquiva'),
      (${P_OUTRA_CLINICA}, ${CLINIC_B}, 'Da clínica B'),
      (${P_R6_ATIVO},      ${CLINIC_A}, 'Regra 6 ativo')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome, arquivado_em) VALUES
      (${P_R6_EQUIPE}, ${CLINIC_A}, 'Regra 6 equipe', now()),
      (${P_R6_FORA},   ${CLINIC_A}, 'Regra 6 fora',   now())`;
    // U_TER_A é da equipe de P_R6_EQUIPE e de P_R6_ATIVO — e NÃO de P_R6_FORA.
    await owner!`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina) VALUES
      (${P_R6_EQUIPE}, ${U_TER_A}, 'terapeuta_referencia', 'ABA'),
      (${P_R6_ATIVO},  ${U_TER_A}, 'terapeuta_referencia', 'ABA')`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  // ─── regra 4: arquivamento não é filtro de RLS ────────────────────────────
  test("regra 4 · coordenador continua LENDO paciente arquivado", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`SELECT id, nome, arquivado_em FROM patient WHERE id = ${P_ARQUIVADO}::uuid`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nome).toBe("Arquivado");
    expect(rows[0]!.arquivado_em).not.toBeNull();
  });

  test("regra 4 · listagem da clínica traz arquivado E ativo (nenhum some)", async () => {
    // O teste que realmente pega uma RLS que passou a filtrar por
    // `arquivado_em IS NULL`: um SELECT SEM predicado de id tem que devolver
    // os dois. Buscar só pelo arquivado esconderia a regressão se o filtro
    // fosse aplicado na listagem e não na busca pontual.
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT id FROM patient ORDER BY nome`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(P_ARQUIVADO);
    expect(ids).toContain(P_ATIVO);
  });

  test("regra 4 · arquivado é exportável: JOIN com audit_log funciona normal", async () => {
    await owner!`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id)
      VALUES (${CLINIC_A}, ${U_COORD_A}, 'paciente_arquivado', 'patient', ${P_ARQUIVADO}, ${P_ARQUIVADO})`;
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`
        SELECT p.nome, a.acao FROM patient p
        JOIN audit_log a ON a.patient_id = p.id
        WHERE p.id = ${P_ARQUIVADO}::uuid`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.acao).toBe("paciente_arquivado");
  });

  // ─── regra 2: dar alta arquiva (trigger do banco) ─────────────────────────
  test("regra 2 · UPDATE de alta_em preenche arquivado_em sozinho (trigger)", async () => {
    const antes = await estado(P_ALTA);
    expect(antes.alta_em).toBeNull();
    expect(antes.arquivado_em).toBeNull(); // pré-condição: nada de falso positivo

    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`UPDATE patient SET alta_em = DATE '2026-07-15' WHERE id = ${P_ALTA}::uuid`,
      ),
    );

    const depois = await estado(P_ALTA);
    expect(depois.alta_em).not.toBeNull();
    // O ponto do teste: ninguém escreveu `arquivado_em` — o trigger escreveu.
    expect(depois.arquivado_em).not.toBeNull();
  });

  test("regra 2 · trigger também vale no INSERT com alta já preenchida", async () => {
    const P_NOVO = "00000000-0000-0000-0000-0000000174d5";
    await owner!`INSERT INTO patient (id, clinic_id, nome, alta_em)
      VALUES (${P_NOVO}, ${CLINIC_A}, 'Nasce com alta', DATE '2026-01-10')`;
    const e = await estado(P_NOVO);
    expect(e.arquivado_em).not.toBeNull();
  });

  test("regra 2 · trigger NÃO reescreve arquivado_em que já existia", async () => {
    // Só age na transição NULL → NOT NULL de alta_em e só com arquivado_em
    // nulo. Se reescrevesse, a data de arquivamento pularia de mês e moveria
    // o paciente de ciclo de fatura.
    const P_JA = "00000000-0000-0000-0000-0000000174d6";
    await owner!`INSERT INTO patient (id, clinic_id, nome, arquivado_em)
      VALUES (${P_JA}, ${CLINIC_A}, 'Já arquivado', TIMESTAMPTZ '2026-01-01 10:00:00+00')`;
    const antes = await estado(P_JA);
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`UPDATE patient SET alta_em = DATE '2026-07-20' WHERE id = ${P_JA}::uuid`,
      ),
    );
    const depois = await estado(P_JA);
    expect(depois.alta_em).not.toBeNull();
    // `toEqual`, não `toBe`: o driver devolve um `Date` novo a cada leitura,
    // então identidade referencial falharia mesmo com o valor idêntico.
    expect(depois.arquivado_em).toEqual(antes.arquivado_em); // intocado
  });

  // ─── regra 3: arquivar nunca dá alta ──────────────────────────────────────
  test("regra 3 · arquivar mantém alta_em NULL (nenhuma alta clínica implícita)", async () => {
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`UPDATE patient SET arquivado_em = now() WHERE id = ${P_SO_ARQUIVA}::uuid`,
      ),
    );
    const e = await estado(P_SO_ARQUIVA);
    expect(e.arquivado_em).not.toBeNull();
    // O que a issue proíbe: um ato COMERCIAL disparar o relógio de retenção
    // LGPD/CFP, que é o efeito de `alta_em`.
    expect(e.alta_em).toBeNull();
  });

  test("regra 1/3 · desarquivar não apaga a alta clínica já registrada", async () => {
    // P_ALTA saiu do teste da regra 2 com alta + arquivado.
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`UPDATE patient SET arquivado_em = NULL WHERE id = ${P_ALTA}::uuid`,
      ),
    );
    const e = await estado(P_ALTA);
    expect(e.arquivado_em).toBeNull(); // desarquivou de verdade
    expect(e.alta_em).not.toBeNull(); // histórico clínico preservado
  });

  // ─── isolamento multi-tenant (não regredir) ───────────────────────────────
  test("paciente de OUTRA clínica continua invisível (arquivado ou não)", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(sql`SELECT id FROM patient WHERE id = ${P_OUTRA_CLINICA}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  test("arquivar paciente de outra clínica não afeta nenhuma linha", async () => {
    await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`UPDATE patient SET arquivado_em = now() WHERE id = ${P_OUTRA_CLINICA}::uuid`,
      ),
    );
    const e = await estado(P_OUTRA_CLINICA);
    expect(e.arquivado_em).toBeNull(); // clínica B intacta
  });

  test("clínica B enxerga o próprio paciente (o isolamento não é cegueira geral)", async () => {
    const rows = await withTenant(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      (db) => db.execute(sql`SELECT id FROM patient`),
    );
    expect(rows.map((r) => r.id)).toEqual([P_OUTRA_CLINICA]);
  });

  // ─── regra 6: desarquivamento automático via SECURITY DEFINER ─────────────
  //
  // Por que existe um definer aqui: `patient_update` (0001) só admite
  // `admin_recepcao`/`coordenador`, e quem grava diário é o TERAPEUTA. Um
  // `UPDATE patient SET arquivado_em = NULL` sob esse papel não estoura —
  // afeta 0 linhas em SILÊNCIO — e o paciente seguiria fora da fatura com a
  // UI dizendo o contrário. `app_desarquivar_paciente` fecha isso: guard
  // interno espelhando o predicado de LEITURA `patient_select`, e RAISE
  // (nunca 0-linhas mudo) quando o chamador não passa no guard.

  /** Chama o definer sob o RLS do papel dado e devolve o booleano. */
  async function desarquivar(role: string, userId: string, patientId: string) {
    const rows = await withTenant(ctx(role, userId), (db) =>
      db.execute(
        sql`SELECT app_desarquivar_paciente(${patientId}::uuid) AS desarquivou`,
      ),
    );
    return rows[0]!.desarquivou as boolean;
  }

  /**
   * Mensagem do RAISE do definer. O Drizzle embrulha o erro do Postgres num
   * "Failed query: ..." genérico e pendura o original em `cause` — asserir só
   * na mensagem de fora daria verde para QUALQUER falha de query (typo de
   * coluna, conexão caída), que é exatamente o teste que não vale nada.
   */
  async function erroAoDesarquivar(userId: string, patientId: string) {
    try {
      await desarquivar("terapeuta", userId, patientId);
    } catch (e) {
      return ((e as Error).cause as Error | undefined)?.message ?? "";
    }
    throw new Error("o definer devia ter estourado, mas a chamada passou");
  }

  test("regra 6 · terapeuta DA EQUIPE desarquiva, e a 2ª chamada é no-op", async () => {
    expect((await estado(P_R6_EQUIPE)).arquivado_em).not.toBeNull();

    expect(await desarquivar("terapeuta", U_TER_A, P_R6_EQUIPE)).toBe(true);
    expect((await estado(P_R6_EQUIPE)).arquivado_em).toBeNull();

    // Idempotência: cinco notas na mesma sessão desarquivam UMA vez. É esse
    // `false` que impede a trilha append-only de ganhar duplicata insuprimível.
    expect(await desarquivar("terapeuta", U_TER_A, P_R6_EQUIPE)).toBe(false);
  });

  test("regra 6 · terapeuta FORA da equipe estoura (não silencia, não desarquiva)", async () => {
    expect(await erroAoDesarquivar(U_TER_A, P_R6_FORA)).toMatch(
      /fora da equipe/,
    );
    expect((await estado(P_R6_FORA)).arquivado_em).not.toBeNull();
  });

  test("regra 6 · paciente de OUTRA clínica estoura (isolamento multi-tenant)", async () => {
    expect(await erroAoDesarquivar(U_TER_A, P_OUTRA_CLINICA)).toMatch(
      /isolamento multi-tenant/,
    );
  });

  test("regra 6 · paciente NÃO arquivado devolve false e não mexe em nada", async () => {
    expect(await desarquivar("terapeuta", U_TER_A, P_R6_ATIVO)).toBe(false);
    const e = await estado(P_R6_ATIVO);
    expect(e.arquivado_em).toBeNull();
    expect(e.alta_em).toBeNull();
  });

  test("terapeuta consegue gravar a trilha (audit_log é append-only p/ app_role)", async () => {
    // Metade da regra 6 que JÁ é possível hoje: quando o definer existir, o
    // INSERT da trilha não vai ser o obstáculo.
    await withTenant(ctx("terapeuta", U_TER_A), (db) =>
      db.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id)
        VALUES (${CLINIC_A}::uuid, ${U_TER_A}::uuid,
                'paciente_desarquivado_automaticamente', 'patient',
                ${P_ARQUIVADO}::uuid, ${P_ARQUIVADO}::uuid)`),
    );
    const [row] = await owner!`SELECT count(*)::int AS n FROM audit_log
      WHERE acao = 'paciente_desarquivado_automaticamente'`;
    expect(row!.n).toBe(1);
  });
});
