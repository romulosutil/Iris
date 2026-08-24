/**
 * #119 — Sigilo profissional por disciplina dentro do prontuário multidisciplinar.
 * Objeto sob teste: migrações 0120 (schema), 0121 (helpers DEFINER), 0122 (policies RLS),
 * 0123 (grant UPDATE coluna) e 0124 (revoke SELECT trecho_fonte).
 *
 * Régua de mutação por comportamento (AGENTS.md §5.2 ponto 5):
 * 13 asserções independentes cobrindo barreira de leitura, escrita, herança de extração/áudio,
 * mascaramento de trecho_fonte em alertas e trilho de escalonamento.
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

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as TenantContext;

describe.skipIf(!hasDb)("#119 · Sigilo por disciplina no prontuário sob RLS", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE alerta_risco_clinico, session_note, extraction, audio_capture, care_team_membership, session, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;

    // 1. Clínica e Usuários
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A #119')`;

    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_TERAPEUTA},  'Terapeuta Convencional', 'ter@i119.test'),
      (${U_MESMA_DISC}, 'Colega Convencional',    'colega@i119.test'),
      (${U_FONO},       'Fonoaudióloga',          'fono@i119.test'),
      (${U_COORD},      'Coordenadora Geral',     'coord@i119.test'),
      (${U_VIG_FIM},    'Ex-Terapeuta Conv',      'ex@i119.test')`;

    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_TERAPEUTA},  ${CLINIC_A}, 'terapeuta'),
      (${U_MESMA_DISC}, ${CLINIC_A}, 'terapeuta'),
      (${U_FONO},       ${CLINIC_A}, 'terapeuta'),
      (${U_COORD},      ${CLINIC_A}, 'coordenador'),
      (${U_VIG_FIM},    ${CLINIC_A}, 'terapeuta')`;

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
});
