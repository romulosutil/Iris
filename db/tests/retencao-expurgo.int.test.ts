/**
 * #352 — Gate de elegibilidade e as duas vias de expurgo (migração 0128).
 *
 * O que esta suíte prova, e por que cada caso existe:
 *
 *  - Até a 0128 a regra de retenção era CONSULTIVA: `app_purgar_paciente`
 *    nunca chamou `app_paciente_expurgavel`, e o coordenador apagava
 *    fisicamente o prontuário de um paciente em atendimento, dentro do prazo
 *    legal de guarda. O gate fecha isso, e os casos 1 e 8 são a régua de
 *    mutação: removido o `IF NOT COALESCE(app_paciente_expurgavel(...))` do
 *    corpo, os dois caem (medido por patch inverso em 25/08/2026).
 *    ⚠️ Tirar SÓ o `COALESCE`, mantendo o gate, é mutante EQUIVALENTE e
 *    sobrevive — e está certo que sobreviva: em lógica de três valores
 *    `alta_em IS NULL` já produz `false`, e o NULL só viria de linha ausente,
 *    que o guard de tenant barra antes. O `COALESCE` é defesa em profundidade,
 *    não o caso principal; matá-lo exigiria asserir o texto do código.
 *  - A via excepcional existe SEM gate porque um titular expurgado por ordem
 *    judicial é, por definição, inelegível — e o replay de tombstones
 *    pós-restore precisa re-expurgá-lo sem que o gate aborte a restauração.
 *  - A `acao` gravada é a MESMA nas duas vias (`paciente_purgado`). Não é
 *    rótulo: `backup.sh:470` extrai o ledger filtrando por essa string
 *    literal. Divergir aqui desfaz o expurgo excepcional no próximo restore.
 *  - As ~24 tabelas descendentes e a pseudonimização de `alerta_risco_clinico`
 *    NÃO tinham cobertura nenhuma antes desta suíte.
 *
 * Roda com `--config vitest.integration.config.ts`. `*.int.test.ts` está no
 * `exclude` do `vitest.config.ts`: rodado sem a config certa, coleta ZERO e sai
 * verde. Conferir a CONTAGEM, nunca a cor.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000003520aa";
const CLINIC_B = "00000000-0000-0000-0000-0000003520bb";
const U_COORD_A = "00000000-0000-0000-0000-0000003520c1";
const U_TER_A = "00000000-0000-0000-0000-0000003520e1";
const U_COORD_B = "00000000-0000-0000-0000-0000003520c2";

// Sujeitos. Cada um existe por um caso — não reaproveitar entre testes que
// purgam: erasure é destrutivo e a ordem dos testes deixaria de ser irrelevante.
const P_SOB_GUARDA = "00000000-0000-0000-0000-000000352001"; // menor, prazo correndo
const P_ELEGIVEL = "00000000-0000-0000-0000-000000352002"; // adulto, prazo vencido
const P_EXCEPCIONAL = "00000000-0000-0000-0000-000000352003"; // inelegível, via judicial
const P_BASE_VAZIA = "00000000-0000-0000-0000-000000352004";
const P_SEM_ALTA = "00000000-0000-0000-0000-000000352005";
const P_SEM_NASC = "00000000-0000-0000-0000-000000352006";
const P_POLITICA_CURTA = "00000000-0000-0000-0000-000000352007"; // política de 6 meses
const P_POLITICA_LONGA = "00000000-0000-0000-0000-000000352008"; // política estendida
const P_OUTRA_CLINICA = "00000000-0000-0000-0000-000000352009";
const P_SUBARVORE = "00000000-0000-0000-0000-00000035200a"; // com descendentes
const P_ESTENDIDO = "00000000-0000-0000-0000-00000035200b"; // D60: prazo vencido, retenção estendida no futuro
const P_ESTENSAO_VENCIDA = "00000000-0000-0000-0000-00000035200c"; // D60: prazo vencido, extensão também vencida

const R_SUB = "00000000-0000-0000-0000-00000035200f";
const S_SUB = "00000000-0000-0000-0000-000000352010";
const G_SUB = "00000000-0000-0000-0000-000000352011";
const ARC_SUB = "00000000-0000-0000-0000-000000352012";

// As 24 tabelas que o erasure varre, na mesma lista do corpo da função. A
// asserção varre TODAS: uma lista incompleta na função não estoura (as FKs são
// restrict/no-action, então ordem errada estoura, mas lista incompleta só deixa
// órfão) — e órfão passa verde se ninguém olhar.
const DESCENDENTES_POR_PATIENT = [
  "evidence",
  "reinforcer_profile",
  "session_snapshot",
  "report",
  "alerta",
  "goal",
  "session",
  "agendamento_recorrente",
  "patient_alvo_disciplina",
  "bloqueio",
  "consent",
  "patient_protocol",
  "care_team_membership",
  "milestone_candidacy",
  "patient_clinical_profile",
] as const;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

const purgar = (p: string, motivo = "fim de retenção") =>
  withTenant(ctx("coordenador", U_COORD_A), (db) =>
    db.execute(sql`SELECT app_purgar_paciente(${p}::uuid, ${motivo})`),
  );

const purgarExcepcional = (p: string, motivo: string, baseLegal: string) =>
  withTenant(ctx("coordenador", U_COORD_A), (db) =>
    db.execute(
      sql`SELECT app_purgar_paciente_excepcional(${p}::uuid, ${motivo}, ${baseLegal})`,
    ),
  );

/**
 * Mensagem REAL do Postgres. `DrizzleQueryError.message` é o SQL que a gente
 * emitiu ("Failed query: SELECT …"), não a exceção do banco — asserir sobre ele
 * dá verde para QUALQUER erro, inclusive um que não seja o guard sob teste. A
 * exceção do Postgres está na cadeia de `cause`.
 */
const mensagemPg = (e: unknown): string => {
  let atual = e as { message?: string; cause?: unknown };
  while (atual?.cause) atual = atual.cause as typeof atual;
  return atual?.message ?? String(e);
};

/** Devolve a mensagem do Postgres, ou `null` se a promessa NÃO rejeitou. */
const erroDe = (p: Promise<unknown>): Promise<string | null> =>
  p.then(
    () => null,
    (e: unknown) => mensagemPg(e),
  );

const elegivel = async (p: string, quem = U_COORD_A, clinica = CLINIC_A) => {
  const r = await withTenant(ctx("coordenador", quem, clinica), (db) =>
    db.execute(sql`SELECT app_paciente_expurgavel(${p}::uuid)::text AS e`),
  );
  return (r[0]?.e as string | null) ?? null;
};

describe.skipIf(!hasDb)("#352 · gate de retenção e vias de expurgo", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE alerta_risco_clinico, report_pdf, report, session_note, session,
      goal, alerta, consent, care_team_membership, patient_clinical_profile,
      audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica 352 A'), (${CLINIC_B}, 'Clínica 352 B')`;
    // Sufixo único por arquivo: `coord@a.test` aparece em 13+ int-tests e a
    // colisão de UNIQUE(email) derruba o setup — cascata que se lê como
    // defeito de RLS.
    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord+352gate@a.test'),
      (${U_TER_A},   'Ter A',   'ter+352gate@a.test'),
      (${U_COORD_B}, 'Coord B', 'coord+352gate@b.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},   ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;

    await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
      (${P_SOB_GUARDA},    ${CLINIC_A}, 'Menor sob guarda', '2020-01-01', '2024-01-01'),
      (${P_ELEGIVEL},      ${CLINIC_A}, 'Adulto vencido',   '1990-01-01', '2005-01-01'),
      (${P_EXCEPCIONAL},   ${CLINIC_A}, 'Ordem judicial',   '2020-01-01', '2024-01-01'),
      (${P_BASE_VAZIA},    ${CLINIC_A}, 'Base vazia',       '2020-01-01', '2024-01-01'),
      (${P_SEM_ALTA},      ${CLINIC_A}, 'Sem alta',         '1980-01-01', NULL),
      (${P_SEM_NASC},      ${CLINIC_A}, 'Sem nascimento',   NULL,         '2005-01-01'),
      (${P_POLITICA_CURTA},${CLINIC_A}, 'Política curta',   '1990-01-01', '2005-01-01'),
      (${P_POLITICA_LONGA},${CLINIC_A}, 'Política longa',   '1990-01-01', '2005-01-01'),
      (${P_SUBARVORE},     ${CLINIC_A}, 'Com subárvore',    '1990-01-01', '2005-01-01'),
      (${P_OUTRA_CLINICA}, ${CLINIC_B}, 'Outra clínica',    '1990-01-01', '2005-01-01'),
      (${P_ESTENDIDO},       ${CLINIC_A}, 'Retenção estendida futura', '1990-01-01', '2005-01-01'),
      (${P_ESTENSAO_VENCIDA},${CLINIC_A}, 'Retenção estendida vencida','1990-01-01', '2005-01-01')`;

    await owner!`UPDATE patient SET retencao_estendida_ate = '2999-01-01', retencao_estendida_motivo = 'ordem judicial 456/2026' WHERE id = ${P_ESTENDIDO}`;
    await owner!`UPDATE patient SET retencao_estendida_ate = '2001-01-01', retencao_estendida_motivo = 'ordem judicial encerrada' WHERE id = ${P_ESTENSAO_VENCIDA}`;

    // Subárvore do sujeito do caso 10/11. Só as tabelas cuja inserção não exige
    // uma cadeia própria de fixtures (extraction, protocol, milestone) — as
    // demais entram na asserção de vazio de qualquer forma.
    await owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_SUBARVORE}, 'tratamento_dados_menor', 'Mãe', 'v1')`;
    await owner!`INSERT INTO report (id, clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload)
      VALUES (${R_SUB}, ${CLINIC_A}, ${P_SUBARVORE}, 'familia', '2026-01-01', '2026-01-31', 'rascunho', '{}')`;
    await owner!`INSERT INTO report_pdf (report_id, bytes, hash) VALUES (${R_SUB}, '\\x00', 'hash-352')`;
    await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina)
      VALUES (${S_SUB}, ${CLINIC_A}, ${P_SUBARVORE}, ${U_TER_A}, '2026-01-05T10:00:00Z', 'fono')`;
    await owner!`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id)
      VALUES (${S_SUB}, ${CLINIC_A}, 'captura_rapida', 'nota com PII', ${U_TER_A})`;
    await owner!`INSERT INTO goal (id, patient_id, clinic_id, descricao, criterio_dominio, criado_por)
      VALUES (${G_SUB}, ${P_SUBARVORE}, ${CLINIC_A}, 'meta', '{}', ${U_COORD_A})`;
    await owner!`INSERT INTO alerta (clinic_id, patient_id, tipo, status, chave_natural, detalhe, criado_por, atualizado_por)
      VALUES (${CLINIC_A}, ${P_SUBARVORE}, 'faltas_excessivas', 'reconhecido', 'k352', '{}', ${U_COORD_A}, ${U_COORD_A})`;
    await owner!`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
      VALUES (${P_SUBARVORE}, ${U_TER_A}, 'fono', 'terapeuta_referencia')`;
    await owner!`INSERT INTO patient_clinical_profile (patient_id) VALUES (${P_SUBARVORE})`;
    // H2: alerta de risco é PSEUDONIMIZADO, nunca deletado — e isso não tinha
    // teste nenhum antes de #352.
    await owner!`INSERT INTO alerta_risco_clinico
      (id, clinic_id, patient_id, session_id, categoria, severidade, certeza,
       trecho_fonte, detalhe, prazo_minutos, prazo_reconhecimento, conduta_registrada, motivo_descarte)
      VALUES (${ARC_SUB}, ${CLINIC_A}, ${P_SUBARVORE}, ${S_SUB},
              'ideacao_suicida', 'ideacao_passiva', 'explicito',
              'trecho com nome Com subárvore', 'detalhe com PII', 60, now(),
              'conduta com PII', 'descarte com PII')`;

    await owner!`UPDATE clinic SET politica_retencao_meses = 6   WHERE id = ${CLINIC_A}`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  // ── 1. O gate ─────────────────────────────────────────────────────────────

  test("1 · paciente NÃO elegível é recusado e continua existindo", async () => {
    expect(await erroDe(purgar(P_SOB_GUARDA))).toMatch(
      /prazo de guarda ainda não venceu/,
    );
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_SOB_GUARDA}`,
    ).toHaveLength(1);
  });

  test("2 · paciente elegível é purgado e a trilha registra acao='paciente_purgado' com patient_id NULL", async () => {
    await purgar(P_ELEGIVEL, "prazo decenal vencido");
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_ELEGIVEL}`,
    ).toHaveLength(0);
    const fato = await owner!`SELECT patient_id, detalhe FROM audit_log
      WHERE acao = 'paciente_purgado' AND entidade_id = ${P_ELEGIVEL}`;
    expect(fato).toHaveLength(1);
    expect(fato[0]!.patient_id).toBeNull();
    expect(fato[0]!.detalhe).toMatchObject({
      motivo: "prazo decenal vencido",
      pseudonimizado: true,
    });
  });

  // ── 2. Via excepcional ────────────────────────────────────────────────────

  test("3 · via excepcional purga paciente NÃO elegível", async () => {
    expect(await elegivel(P_EXCEPCIONAL)).toBe("false");
    await purgarExcepcional(
      P_EXCEPCIONAL,
      "pedido de eliminação do titular",
      "LGPD Art. 18, V — decisão judicial 123/2026",
    );
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_EXCEPCIONAL}`,
    ).toHaveLength(0);
  });

  test("4 · via excepcional grava a MESMA acao='paciente_purgado' e a base legal no detalhe", async () => {
    // A `acao` é interface: `backup.sh:470` filtra por essa string literal para
    // montar o ledger de tombstones. Uma string própria aqui faria o expurgo
    // excepcional ser DESFEITO no primeiro restore.
    const fato = await owner!`SELECT acao, detalhe FROM audit_log
      WHERE entidade_id = ${P_EXCEPCIONAL} AND entidade = 'patient'
        AND detalhe ? 'excepcional'`;
    expect(fato).toHaveLength(1);
    expect(fato[0]!.acao).toBe("paciente_purgado");
    expect(fato[0]!.detalhe).toMatchObject({
      base_legal: "LGPD Art. 18, V — decisão judicial 123/2026",
      excepcional: true,
    });
    expect(
      await owner!`SELECT 1 FROM audit_log WHERE acao LIKE 'paciente_purgado_%'`,
    ).toHaveLength(0);
  });

  test("5 · base legal vazia ou só espaços é recusada", async () => {
    expect(await erroDe(purgarExcepcional(P_BASE_VAZIA, "m", ""))).toMatch(
      /base legal é obrigatória/,
    );
    expect(await erroDe(purgarExcepcional(P_BASE_VAZIA, "m", "   "))).toMatch(
      /base legal é obrigatória/,
    );
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_BASE_VAZIA}`,
    ).toHaveLength(1);
  });

  // ── 3. Elegibilidade ──────────────────────────────────────────────────────

  test("6 · alta_em NULL e nascimento NULL dão false, não erro", async () => {
    expect(await elegivel(P_SEM_ALTA)).toBe("false");
    expect(await elegivel(P_SEM_NASC)).toBe("false");
  });

  test("7 · politica_retencao_meses menor que 120 NÃO encurta o prazo", async () => {
    // Clínica A está com 6 meses. `GREATEST(10 anos, 6 meses)` = 10 anos: a
    // política é piso de extensão, nunca de redução — reduzir o prazo por
    // configuração da clínica seria a clínica se autorizando a apagar cedo.
    await owner!`UPDATE clinic SET politica_retencao_meses = 6 WHERE id = ${CLINIC_A}`;
    const r = await owner!`SELECT
      app_retencao_vence_em('2005-01-01'::date, '1990-01-01'::date, 6)::text   AS curta,
      app_retencao_vence_em('2005-01-01'::date, '1990-01-01'::date, NULL)::text AS sem`;
    expect(r[0]!.curta).toBe("2015-01-01");
    expect(r[0]!.sem).toBe("2015-01-01");
    expect(await elegivel(P_POLITICA_CURTA)).toBe("true");
  });

  test("8 · politica_retencao_meses maior que 120 ESTENDE o prazo", async () => {
    // 240 meses (20 anos) empurra o vencimento de 2015 para 2025 — extensão
    // medida na aritmética, sem depender da data de hoje.
    const r = await owner!`SELECT
      app_retencao_vence_em('2005-01-01'::date, '1990-01-01'::date, 240)::text AS m240,
      app_retencao_vence_em('2005-01-01'::date, '1990-01-01'::date, 360)::text AS m360`;
    expect(r[0]!.m240).toBe("2025-01-01");
    expect(r[0]!.m360).toBe("2035-01-01");

    // E a extensão alcança o GATE, não só o helper: com 360 meses o paciente
    // que era elegível deixa de ser, e a purga passa a ser recusada.
    await owner!`UPDATE clinic SET politica_retencao_meses = 360 WHERE id = ${CLINIC_A}`;
    expect(await elegivel(P_POLITICA_LONGA)).toBe("false");
    expect(await erroDe(purgar(P_POLITICA_LONGA))).toMatch(
      /prazo de guarda ainda não venceu/,
    );
    await owner!`UPDATE clinic SET politica_retencao_meses = NULL WHERE id = ${CLINIC_A}`;
  });

  test("9 · cross-tenant devolve a MESMA mensagem opaca de paciente inexistente", async () => {
    // A mensagem tem que ser indistinguível, senão a função vira oráculo de
    // existência entre clínicas. É por isso que o gate é o TERCEIRO guard.
    const inexistente = await erroDe(
      purgar("00000000-0000-0000-0000-0000000000ff"),
    );
    const outraClinica = await erroDe(purgar(P_OUTRA_CLINICA));
    expect(inexistente).toMatch(/paciente inexistente ou sem permissão/);
    expect(outraClinica).toBe(inexistente);
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_OUTRA_CLINICA}`,
    ).toHaveLength(1);
  });

  // ── 3b. D60 — extensão de retenção por paciente (ordem judicial) ────────────

  test("12 · retencao_estendida_ate no futuro bloqueia o gate mesmo com prazo padrão vencido", async () => {
    // Regra de mutação: sem `AND (retencao_estendida_ate IS NULL OR ...)` no
    // predicado, este caso vira elegível=true e o teste cai.
    expect(await elegivel(P_ESTENDIDO)).toBe("false");
    expect(await erroDe(purgar(P_ESTENDIDO))).toMatch(
      /prazo de guarda ainda não venceu/,
    );
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_ESTENDIDO}`,
    ).toHaveLength(1);
    const fila = await withTenant(ctx("coordenador", U_COORD_A), (db) =>
      db.execute(
        sql`SELECT paciente_id FROM app_pacientes_expurgaveis(50, 0) WHERE paciente_id = ${P_ESTENDIDO}::uuid`,
      ),
    );
    expect(fila).toHaveLength(0);
  });

  test("13 · retencao_estendida_ate já vencida volta a ser elegível", async () => {
    // NULL e "data passada" têm de dar o MESMO resultado — a extensão não é
    // permanente, só adia. Prova que a comparação é `>=`, não `IS NULL` puro.
    expect(await elegivel(P_ESTENSAO_VENCIDA)).toBe("true");
    await purgar(P_ESTENSAO_VENCIDA, "extensão judicial encerrada");
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_ESTENSAO_VENCIDA}`,
    ).toHaveLength(0);
  });

  // ── 4. Erasure completo ───────────────────────────────────────────────────

  test("10 · TODAS as tabelas descendentes ficam vazias após a purga", async () => {
    await purgar(P_SUBARVORE, "fim de retenção");
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_SUBARVORE}`,
    ).toHaveLength(0);
    for (const tabela of DESCENDENTES_POR_PATIENT) {
      const linhas =
        await owner!`SELECT 1 FROM ${owner!(tabela)} WHERE patient_id = ${P_SUBARVORE}`;
      expect(linhas, `${tabela} ainda tem linhas do sujeito`).toHaveLength(0);
    }
    // Descendentes por avô: session_note e report_pdf não têm patient_id.
    expect(
      await owner!`SELECT 1 FROM session_note WHERE session_id = ${S_SUB}`,
    ).toHaveLength(0);
    expect(
      await owner!`SELECT 1 FROM report_pdf WHERE report_id = ${R_SUB}`,
    ).toHaveLength(0);
  });

  test("11 · alerta_risco_clinico do sujeito é PSEUDONIMIZADO, não deletado", async () => {
    const arc =
      await owner!`SELECT patient_id, session_id, trecho_fonte, detalhe,
                          conduta_registrada, motivo_descarte, pseudonimizado_em
                     FROM alerta_risco_clinico WHERE id = ${ARC_SUB}`;
    expect(arc).toHaveLength(1); // sobrevive
    expect(arc[0]!.patient_id).toBeNull();
    expect(arc[0]!.session_id).toBeNull();
    expect(arc[0]!.trecho_fonte).toBe("[expurgado]");
    expect(arc[0]!.detalhe).toBe("[expurgado]");
    expect(arc[0]!.conduta_registrada).toBe("[expurgado]");
    expect(arc[0]!.motivo_descarte).toBe("[expurgado]");
    expect(arc[0]!.pseudonimizado_em).not.toBeNull();
  });
});
