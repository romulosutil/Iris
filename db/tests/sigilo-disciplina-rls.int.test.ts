/**
 * #119 — Sigilo profissional por disciplina dentro do prontuário multidisciplinar.
 * Objeto sob teste: migrações 0120 (schema), 0121 (helpers DEFINER), 0122 (policies RLS),
 * 0123 (grant UPDATE coluna), 0124 (revoke SELECT trecho_fonte), 0142 (#529, guard de tenant
 * em `app_alerta_trecho_fonte`) e 0149 (#552, guard de tenant em `app_session_sob_sigilo`).
 *
 * Régua de mutação por comportamento (AGENTS.md §5.2 ponto 5):
 * 18 asserções independentes cobrindo barreira de leitura, escrita, herança de extração/áudio,
 * mascaramento de trecho_fonte em alertas, trilho de escalonamento e a fronteira de tenant
 * DENTRO dos dois definers.
 *
 * Roda com `pnpm test:rls`. Gate de env em `integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000000119aa";
const PATIENT_A = "00000000-0000-0000-0000-0000000119ba";

const U_TERAPEUTA = "00000000-0000-0000-0000-000000011901"; // autor da sessão (Convencional)
const U_MESMA_DISC = "00000000-0000-0000-0000-000000011902"; // 2º profissional Convencional na equipe ativa
const U_FONO = "00000000-0000-0000-0000-000000011903"; // Fonoaudióloga na equipe ativa
const U_COORD = "00000000-0000-0000-0000-000000011904"; // Coordenadora
const U_VIG_FIM = "00000000-0000-0000-0000-000000011905"; // Convencional com vigência encerrada

const SESS_SIGILOSA = "00000000-0000-0000-0000-000000011911";
const NOTE_SIGILOSA = "00000000-0000-0000-0000-000000011921";
const EXTRACTION_SIGILOSA = "00000000-0000-0000-0000-000000011931";
const AUDIO_SIGILOSO = "00000000-0000-0000-0000-000000011941";

const SESS_PUBLICA = "00000000-0000-0000-0000-000000011912";
const NOTE_PUBLICA = "00000000-0000-0000-0000-000000011922";
const EXTRACTION_PUBLICA = "00000000-0000-0000-0000-000000011932";

const ALERTA_SESS_SIGILOSA = "00000000-0000-0000-0000-000000011951";
const ALERTA_SEM_SESSAO = "00000000-0000-0000-0000-000000011952";

// #529 (auditoria 360, S-02) — segundo tenant, para o caso negativo cross-tenant
// de `app_alerta_trecho_fonte`. A coordenadora de B conhece o UUID do alerta de A
// (é o único dado que o atacante precisa) e NUNCA pode receber o trecho.
const CLINIC_B = "00000000-0000-0000-0000-0000000119bb";
const U_COORD_B = "00000000-0000-0000-0000-000000011906"; // Coordenadora da clínica B

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("#119 · Sigilo por disciplina no prontuário sob RLS", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE alerta_risco_clinico, session_note, extraction, audio_capture, care_team_membership, session, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;

    // 1. Clínica e Usuários
    await owner!`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #119'),
      (${CLINIC_B}, 'Clínica B #529')`;

    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_TERAPEUTA},  'Terapeuta Convencional', 'ter@i119.test'),
      (${U_MESMA_DISC}, 'Colega Convencional',    'colega@i119.test'),
      (${U_FONO},       'Fonoaudióloga',          'fono@i119.test'),
      (${U_COORD},      'Coordenadora Geral',     'coord@i119.test'),
      (${U_VIG_FIM},    'Ex-Terapeuta Conv',      'ex@i119.test'),
      (${U_COORD_B},    'Coordenadora da B',      'coord.b@i529.test')`;

    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_TERAPEUTA},  ${CLINIC_A}, 'terapeuta'),
      (${U_MESMA_DISC}, ${CLINIC_A}, 'terapeuta'),
      (${U_FONO},       ${CLINIC_A}, 'terapeuta'),
      (${U_COORD},      ${CLINIC_A}, 'coordenador'),
      (${U_VIG_FIM},    ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B},    ${CLINIC_B}, 'coordenador')`;

    // 2. Paciente e Equipe de Cuidado
    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT_A}, ${CLINIC_A}, 'Paciente Multi #119')`;

    await owner!`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina, vigencia_fim) VALUES
      (${PATIENT_A}, ${U_TERAPEUTA},  'terapeuta_referencia', 'Convencional',     NULL),
      (${PATIENT_A}, ${U_MESMA_DISC}, 'substituto',           'Convencional',     NULL),
      (${PATIENT_A}, ${U_FONO},       'substituto',           'Fonoaudiologia',   NULL),
      (${PATIENT_A}, ${U_VIG_FIM},    'substituto',           'Convencional',     now() - interval '1 day')`;

    // 3. Sessão Sigilosa (Convencional) e Artefatos Filhos
    await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
      (${SESS_SIGILOSA}, ${CLINIC_A}, ${PATIENT_A}, ${U_TERAPEUTA}, now() - interval '2 hours', 'Convencional')`;

    await owner!`INSERT INTO session_note (id, clinic_id, session_id, tipo, texto, autor_id, visibility_level) VALUES
      (${NOTE_SIGILOSA}, ${CLINIC_A}, ${SESS_SIGILOSA}, 'nota_consolidada', 'Texto Íntimo de Sessão Sigilosa', ${U_TERAPEUTA}, 'discipline_only')`;

    await owner!`INSERT INTO extraction (id, clinic_id, session_id, estado, subtipo, confianca, trecho_fonte, payload) VALUES
      (${EXTRACTION_SIGILOSA}, ${CLINIC_A}, ${SESS_SIGILOSA}, 'sugerida', 'evidencia', 'alta', 'Trecho literal do diário sigiloso', '{"resumo":"ia"}'::jsonb)`;

    await owner!`INSERT INTO audio_capture (id, clinic_id, session_id, objeto_ref, status_upload, duracao_segundos) VALUES
      (${AUDIO_SIGILOSO}, ${CLINIC_A}, ${SESS_SIGILOSA}, 'audios/sess1.webm', 'confirmado', 60)`;

    // 4. Sessão Pública (Multidisciplinar)
    await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
      (${SESS_PUBLICA}, ${CLINIC_A}, ${PATIENT_A}, ${U_TERAPEUTA}, now() - interval '1 hour', 'Convencional')`;

    await owner!`INSERT INTO session_note (id, clinic_id, session_id, tipo, texto, autor_id, visibility_level) VALUES
      (${NOTE_PUBLICA}, ${CLINIC_A}, ${SESS_PUBLICA}, 'nota_consolidada', 'Texto Público Compartilhado', ${U_TERAPEUTA}, 'multidisciplinary')`;

    await owner!`INSERT INTO extraction (id, clinic_id, session_id, estado, subtipo, confianca, trecho_fonte, payload) VALUES
      (${EXTRACTION_PUBLICA}, ${CLINIC_A}, ${SESS_PUBLICA}, 'sugerida', 'evidencia', 'alta', 'Trecho público', '{"resumo":"ia"}'::jsonb)`;

    // 5. Alertas de Risco Clínico
    await owner!`INSERT INTO alerta_risco_clinico (
      id, clinic_id, patient_id, session_id, origem, origem_extraction_id, categoria, severidade, certeza,
      trecho_fonte, detalhe, prazo_minutos, prazo_reconhecimento
    ) VALUES
      (${ALERTA_SESS_SIGILOSA}, ${CLINIC_A}, ${PATIENT_A}, ${SESS_SIGILOSA}, 'diario_sessao', NULL, 'ideacao_suicida', 'ideacao_ativa_com_plano', 'explicito',
       'Citação Literal Confidencial do Diário', 'Risco identificado pelo agente', 60, now() + interval '1 hour'),
      (${ALERTA_SEM_SESSAO}, ${CLINIC_A}, ${PATIENT_A}, NULL, 'registro_pensamento', ${EXTRACTION_PUBLICA}, 'autolesao', 'autolesao_recente', 'explicito',
       'Citação Literal RPD Sem Sessão', 'Risco originado de RPD', 120, now() + interval '2 hours')`;
  });

  afterAll(async () => {
    await owner?.end();
  });

  // ─── T3: Barreira de Leitura (Comportamentos #1 a #8) ──────────────────────

  test("1. esconde de outra disciplina: Fono lê session_note sigilosa -> 0 linhas", async () => {
    const rows = await withTenant(ctx("terapeuta", U_FONO), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  test("2. mostra para a mesma disciplina: 2º Convencional lê session_note sigilosa -> 1 linha, texto integral", async () => {
    const rows = await withTenant(ctx("terapeuta", U_MESMA_DISC), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.texto).toBe("Texto Íntimo de Sessão Sigilosa");
  });

  test("3. mostra para o autor: terapeuta da sessão lê session_note sigilosa -> 1 linha", async () => {
    const rows = await withTenant(ctx("terapeuta", U_TERAPEUTA), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.texto).toBe("Texto Íntimo de Sessão Sigilosa");
  });

  test("4. esconde do coordenador: Coordenadora lê session_note sigilosa -> 0 linhas", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  test("5. vigência conta: Convencional com vigência encerrada lê session_note sigilosa -> 0 linhas", async () => {
    const rows = await withTenant(ctx("terapeuta", U_VIG_FIM), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  test("6. default preserva: nota multidisciplinary é legível por Fono e Coordenadora", async () => {
    const rowsFono = await withTenant(ctx("terapeuta", U_FONO), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_PUBLICA}::uuid`),
    );
    expect(rowsFono).toHaveLength(1);
    expect(rowsFono[0]!.texto).toBe("Texto Público Compartilhado");

    const rowsCoord = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`SELECT id, texto FROM session_note WHERE id = ${NOTE_PUBLICA}::uuid`),
    );
    expect(rowsCoord).toHaveLength(1);
    expect(rowsCoord[0]!.texto).toBe("Texto Público Compartilhado");
  });

  test("7. extraction herda: Coordenadora não lê extraction de sessão sigilosa -> 0 linhas", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`SELECT id, trecho_fonte FROM extraction WHERE id = ${EXTRACTION_SIGILOSA}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  test("8. audio_capture herda: Coordenadora não lê audio_capture de sessão sigilosa -> 0 linhas", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`SELECT id, objeto_ref FROM audio_capture WHERE id = ${AUDIO_SIGILOSO}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });

  // ─── T4: Grant de UPDATE na coluna visibility_level (Comportamentos #11 e #12) ──

  test("11. app_role pode atualizar visibility_level", async () => {
    await withTenant(ctx("terapeuta", U_TERAPEUTA), (db) =>
      db.execute(sql`
        UPDATE session_note
           SET visibility_level = 'discipline_only'
         WHERE id = ${NOTE_PUBLICA}::uuid
      `),
    );

    const [row] = await owner!<{ visibility_level: string }[]>`
      SELECT visibility_level FROM session_note WHERE id = ${NOTE_PUBLICA}
    `;
    expect(row?.visibility_level).toBe("discipline_only");

    // Restaura para os demais testes
    await owner!`UPDATE session_note SET visibility_level = 'multidisciplinary' WHERE id = ${NOTE_PUBLICA}`;
  });

  test("12. app_role continua proibido de dar UPDATE em colunas protegidas (ex: tipo)", async () => {
    await expect(
      withTenant(ctx("terapeuta", U_TERAPEUTA), (db) =>
        db.execute(sql`
          UPDATE session_note
             SET tipo = 'resumo_estruturado'
           WHERE id = ${NOTE_PUBLICA}::uuid
        `),
      ),
    ).rejects.toThrow();
  });

  // ─── T7: Alerta de Risco Clínico (Comportamentos #9, #10 e #13) ──────────────

  test("9. alerta_risco_clinico: Coordenadora vê alerta de sessão sigilosa mas com trecho_fonte nulo via helper", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`
        SELECT id, categoria, severidade, app_alerta_trecho_fonte(id) AS trecho_fonte
          FROM alerta_risco_clinico
         WHERE id = ${ALERTA_SESS_SIGILOSA}::uuid
      `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.categoria).toBe("ideacao_suicida");
    expect(rows[0]!.severidade).toBe("ideacao_ativa_com_plano");
    expect(rows[0]!.trecho_fonte).toBeNull();
  });

  test("10. alerta_risco_clinico: Terapeuta da mesma disciplina lê trecho_fonte íntegro via helper", async () => {
    const rows = await withTenant(ctx("terapeuta", U_MESMA_DISC), (db) =>
      db.execute(sql`
        SELECT id, categoria, severidade, app_alerta_trecho_fonte(id) AS trecho_fonte
          FROM alerta_risco_clinico
         WHERE id = ${ALERTA_SESS_SIGILOSA}::uuid
      `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.categoria).toBe("ideacao_suicida");
    expect(rows[0]!.trecho_fonte).toBe("Citação Literal Confidencial do Diário");
  });

  test("13. alerta_risco_clinico: SELECT direto na coluna trecho_fonte falha com 42501 para app_role", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD), (db) =>
        db.execute(sql`SELECT id, trecho_fonte FROM alerta_risco_clinico WHERE id = ${ALERTA_SESS_SIGILOSA}::uuid`),
      ),
    ).rejects.toThrow();
  });

  // ─── #529 (auditoria 360, S-02): fronteira de tenant DENTRO do definer ──────
  //
  // `app_alerta_trecho_fonte` é SECURITY DEFINER: roda com os direitos do dono e
  // IGNORA a RLS de `alerta_risco_clinico`. No ramo `session_id IS NULL` (alerta
  // de RPD/instrumento, CHECK da 0114) a 0122 devolvia o trecho sem nenhum
  // predicado de clínica — bastava conhecer o UUID. O guard interno é a ÚNICA
  // fronteira (CLAUDE.md §Migrações, item 5), e ele espelha o predicado da
  // policy `alerta_risco_scope`. A chamada é feita SEM `FROM alerta_risco_clinico`
  // de propósito: passar pela tabela deixaria a RLS filtrar a linha antes e o
  // teste ficaria verde pelo motivo errado, sem exercitar o definer.

  test("14. app_alerta_trecho_fonte: coordenadora de OUTRA clínica, alerta sem sessão -> NULL (nunca o trecho)", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_B, CLINIC_B), (db) =>
      db.execute(sql`SELECT app_alerta_trecho_fonte(${ALERTA_SEM_SESSAO}::uuid) AS trecho_fonte`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trecho_fonte).toBeNull();
  });

  test("15. app_alerta_trecho_fonte: coordenadora da MESMA clínica, alerta sem sessão -> trecho íntegro (contraprova)", async () => {
    // Sem esta contraprova, um definer que devolvesse NULL SEMPRE passaria no
    // caso 14 e apagaria o trecho de todo alerta de RPD/instrumento do produto.
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`SELECT app_alerta_trecho_fonte(${ALERTA_SEM_SESSAO}::uuid) AS trecho_fonte`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trecho_fonte).toBe("Citação Literal RPD Sem Sessão");
  });

  // ─── #552: fronteira de tenant DENTRO de app_session_sob_sigilo ─────────────
  //
  // `app_session_sob_sigilo` é SECURITY DEFINER com EXECUTE para `app_role` e,
  // até a 0149, sem predicado de clínica: qualquer app_role de qualquer tenant
  // que conhecesse o UUID de uma sessão descobria se ela tem nota
  // `discipline_only`. É 1 bit sem conteúdo — mas é um bit que fala de sigilo
  // clínico. A chamada é feita SEM `FROM session` de propósito: passar pela
  // tabela deixaria a RLS filtrar a linha antes e o teste ficaria verde pelo
  // motivo errado, sem exercitar o definer.

  test("16. app_session_sob_sigilo: coordenadora de OUTRA clínica -> false (nunca o bit de sigilo)", async () => {
    const rows = await withTenant(ctx("coordenador", U_COORD_B, CLINIC_B), (db) =>
      db.execute(sql`SELECT app_session_sob_sigilo(${SESS_SIGILOSA}::uuid) AS sob_sigilo`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sob_sigilo).toBe(false);
  });

  test("17. app_session_sob_sigilo: in-tenant intacto — sigilosa true, pública false (contraprova)", async () => {
    // Sem esta contraprova, um definer que devolvesse false SEMPRE passaria no
    // caso 16 e desligaria o sigilo por disciplina do produto inteiro.
    const rows = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`
        SELECT app_session_sob_sigilo(${SESS_SIGILOSA}::uuid) AS sigilosa,
               app_session_sob_sigilo(${SESS_PUBLICA}::uuid) AS publica`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sigilosa).toBe(true);
    expect(rows[0]!.publica).toBe(false);
  });

  test("18. app_session_conteudo_visivel: resultado idêntico ao de antes do guard (contraprova do Design §2)", async () => {
    // O guard novo faz `NOT app_session_sob_sigilo(x)` virar true para sessão
    // alheia, mas o `AND app_session_clinica_visivel(x)` já era false: o
    // composto continua false cross-tenant. In-tenant nada muda.
    const alheia = await withTenant(ctx("coordenador", U_COORD_B, CLINIC_B), (db) =>
      db.execute(sql`SELECT app_session_conteudo_visivel(${SESS_SIGILOSA}::uuid) AS v`),
    );
    expect(alheia[0]!.v).toBe(false);

    // Coordenadora de A não é da disciplina da sessão sigilosa: continua sem
    // ver o conteúdo dela e continua vendo o da sessão pública.
    const propria = await withTenant(ctx("coordenador", U_COORD), (db) =>
      db.execute(sql`
        SELECT app_session_conteudo_visivel(${SESS_SIGILOSA}::uuid) AS sigilosa,
               app_session_conteudo_visivel(${SESS_PUBLICA}::uuid) AS publica`),
    );
    expect(propria[0]!.sigilosa).toBe(false);
    expect(propria[0]!.publica).toBe(true);
  });
});

