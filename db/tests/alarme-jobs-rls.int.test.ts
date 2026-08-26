/**
 * #294/Task 2 — prova de que a role `iris_alarme` ENXERGA através das funções
 * `SECURITY DEFINER` da `0129_alarme_jobs_infra.sql`, e não só que a migração
 * rodou. Task 1 criou a role + `app_alarme_billing_atrasado` +
 * `app_alarme_escalonamento_atrasado`; sem este teste ela sai verde tanto
 * certa quanto errada (o defeito clássico: `GRANT` de tabela sem policy
 * devolve zero linhas sem erro — ver comentário na própria migração).
 *
 * Por isso a asserção positiva conecta como `iris_alarme_login`, não como a
 * role dona (`MIGRATION_DATABASE_URL`/superusuário + BYPASSRLS): uma
 * asserção rodada como dono passaria mesmo se as funções não fossem
 * `SECURITY DEFINER` — RLS não se aplica a superusuário de qualquer jeito.
 *
 * Mutação provada manualmente (fora deste arquivo, via `psql`): trocar
 * `app_alarme_billing_atrasado` por uma versão sem `SECURITY DEFINER` faz a
 * asserção positiva cair para `total = 0` — prova de que o teste morde.
 *
 * Sufixo de fixture `294a` nos e-mails/identificadores: evita colisão de
 * `UNIQUE(email)` com os outros ~65 arquivos `*.int.test.ts` que rodam em
 * paralelo (memória `email-de-fixture-colide-entre-int-tests`).
 *
 * Limpeza por `DELETE` escopado pelos ids inseridos — nunca `TRUNCATE`, que
 * colidiria com outros int-tests rodando em paralelo (memória
 * `truncate-extra-colide-com-int-test-paralelo`).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const LOGIN_ROLE = "iris_alarme_login";
const LOGIN_PASSWORD = "iris_alarme_login_teste_294";

// ─── identificadores fixos, sufixados #294a para não colidir com outros arquivos ──
const CLINICA = "00000000-0000-0000-0000-000000294aa1";
const USER_TERAPEUTA = "00000000-0000-0000-0000-000000294ac1";
const PACIENTE = "00000000-0000-0000-0000-0000002940a1";
const SESSAO = "00000000-0000-0000-0000-0000002945a1";
const SUBSCRIPTION = "00000000-0000-0000-0000-0000002946a1";
const BILLING_CYCLE = "00000000-0000-0000-0000-0000002947a1";
const ALERTA_RISCO = "00000000-0000-0000-0000-0000002948a1";

describe.skipIf(!hasDb)("#294 · role iris_alarme enxerga via funções definer", () => {
  beforeAll(async () => {
    // `iris_alarme_login` é criada FORA das migrações (mesmo padrão de
    // `iris_retencao`/`iris_arquivamento`, comentado na 0129): a role de
    // login não é objeto versionado, é provisionamento de ambiente. O teste
    // provisiona a sua própria aqui, idempotente, porque o ambiente de CI
    // não tem outro lugar que a crie.
    await owner!.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_ROLE}') THEN
          CREATE ROLE ${LOGIN_ROLE} LOGIN PASSWORD '${LOGIN_PASSWORD}' IN ROLE iris_alarme;
        END IF;
      END
      $$;
    `);

    // Plantio: clínica + assinatura + ciclo de billing ATRASADO (aberto,
    // vencido há 5h) + paciente/sessão + alerta de risco ATRASADO (aberto,
    // prazo de reconhecimento vencido há 1h).
    await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINICA}, 'Clínica #294a', false)`;

    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${USER_TERAPEUTA}, 'Terapeuta #294a', 'terapeuta.294a@t.com')`;

    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PACIENTE}, ${CLINICA}, 'Paciente #294a')`;

    await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina) VALUES
      (${SESSAO}, ${CLINICA}, ${PACIENTE}, ${USER_TERAPEUTA}, now(), 'realizada', 'desconhecida')`;

    await owner!`INSERT INTO subscription (id, clinic_id, status, provider) VALUES
      (${SUBSCRIPTION}, ${CLINICA}, 'active', 'mercado_pago')`;

    await owner!`INSERT INTO billing_cycle (id, clinic_id, subscription_id, inicio, fim, status) VALUES
      (${BILLING_CYCLE}, ${CLINICA}, ${SUBSCRIPTION}, now() - interval '35 days', now() - interval '5 hours', 'aberto')`;

    await owner!`INSERT INTO alerta_risco_clinico (
        id, clinic_id, patient_id, session_id,
        categoria, severidade, certeza, trecho_fonte, detalhe,
        status, prazo_minutos, prazo_reconhecimento
      ) VALUES (
        ${ALERTA_RISCO}, ${CLINICA}, ${PACIENTE}, ${SESSAO},
        'ideacao_suicida', 'tentativa_relatada', 'explicito', 'trecho de teste #294a', 'detalhe de teste #294a',
        'aberto', 60, now() - interval '1 hour'
      )`;
  });

  afterAll(async () => {
    // DELETE escopado — nunca TRUNCATE.
    await owner!`DELETE FROM alerta_risco_clinico WHERE id = ${ALERTA_RISCO}`;
    await owner!`DELETE FROM billing_cycle WHERE id = ${BILLING_CYCLE}`;
    await owner!`DELETE FROM subscription WHERE id = ${SUBSCRIPTION}`;
    await owner!`DELETE FROM session WHERE id = ${SESSAO}`;
    await owner!`DELETE FROM patient WHERE id = ${PACIENTE}`;
    await owner!`DELETE FROM app_user WHERE id = ${USER_TERAPEUTA}`;
    await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
    await owner?.end();
  });

  test("app_alarme_billing_atrasado enxerga o ciclo plantado, como iris_alarme_login", async () => {
    const url = process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_ROLE}:${LOGIN_PASSWORD}@`,
    );
    const conn = postgres(url, { max: 1 });
    try {
      const rows = await conn<
        { total: number; primeira_clinic_id: string; primeiro_vencimento: Date }[]
      >`SELECT * FROM app_alarme_billing_atrasado('2 hours'::interval)`;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.total).toBeGreaterThanOrEqual(1);
      expect(rows[0]!.primeira_clinic_id).not.toBeNull();
    } finally {
      await conn.end();
    }
  });

  test("app_alarme_escalonamento_atrasado enxerga o alerta plantado, como iris_alarme_login", async () => {
    const url = process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_ROLE}:${LOGIN_PASSWORD}@`,
    );
    const conn = postgres(url, { max: 1 });
    try {
      const rows = await conn<
        { total: number; primeira_clinic_id: string; primeiro_vencimento: Date }[]
      >`SELECT * FROM app_alarme_escalonamento_atrasado('10 minutes'::interval)`;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.total).toBeGreaterThanOrEqual(1);
      expect(rows[0]!.primeira_clinic_id).not.toBeNull();
    } finally {
      await conn.end();
    }
  });

  test("SELECT cru em billing_cycle é negado a iris_alarme_login (fronteira de privilégio)", async () => {
    // Se este teste passar a devolver linhas em vez de estourar, alguém
    // acrescentou um GRANT de tabela para iris_alarme e a fronteira de
    // privilégio — que existe justamente porque as funções são a ÚNICA
    // superfície de leitura desta role — caiu.
    const url = process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_ROLE}:${LOGIN_PASSWORD}@`,
    );
    const conn = postgres(url, { max: 1 });
    try {
      await expect(
        conn`SELECT 1 FROM billing_cycle LIMIT 1`,
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await conn.end();
    }
  });
});
