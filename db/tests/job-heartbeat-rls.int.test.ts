/**
 * #536 (DA-03) — fronteira de acesso de `job_heartbeat` (migração 0146).
 *
 * O que se prova aqui, conectando como as roles REAIS (não como a dona, que é
 * BYPASSRLS e passaria com a migração certa ou errada):
 *  - a role de job (`iris_retencao`) GRAVA o heartbeat DO SEU job via
 *    `app_job_heartbeat_gravar`;
 *  - `iris_alarme` LÊ via `app_alarme_job_heartbeats` e enxerga o que o job
 *    gravou — é isto que mata o defeito "GRANT sem policy devolve zero linhas
 *    sem erro";
 *  - **mapa job -> role** (revisão pós-PR #551): `app_role` NÃO grava
 *    `retencao` (P0001) — EXECUTE sozinho deixaria um SQL injection no app
 *    silenciar o alarme de qualquer job; `iris_retencao` NÃO grava
 *    `exportacao`; job fora do mapa é P0001 mesmo para a dona;
 *  - `iris_alarme` NÃO grava (42501) e `app_role` NÃO lê a tabela direto
 *    (42501): o que cada role consegue é o que a função dela permite;
 *  - `p_ok=false` avança `ultimo_erro` e PRESERVA `ultimo_ok`;
 *  - nome de job inválido estoura P0001; `detalhe` é truncado a 200.
 *
 * Este arquivo é também o teste que o oráculo sistêmico do W1
 * (`DEFINERS_GLOBAIS_JUSTIFICADOS` em clinic-id-helper-rls.int.test.ts) aponta
 * como prova de que `app_job_heartbeat_gravar` valida job->role por dentro.
 *
 * Roles de LOGIN são criadas aqui, idempotentes, fora das migrações (mesmo
 * padrão de `alarme-jobs-rls.int.test.ts`). Limpeza por `DELETE` escopado nos
 * jobs que este arquivo toca (`retencao`, `exportacao`) — nenhum outro
 * int-test grava heartbeat.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const JOB_RETENCAO = "retencao";
const JOB_APP = "exportacao";
const LOGIN_JOB = "iris_retencao_login_536";
const LOGIN_ALARME = "iris_alarme_login_536";
const SENHA = "senha_de_teste_536";

function urlComo(role: string): string {
  return process.env.MIGRATION_DATABASE_URL!.replace(
    /:\/\/[^@]+@/,
    `://${role}:${SENHA}@`,
  );
}

type Linha = {
  job: string;
  ultimo_ok: Date | null;
  ultimo_erro: Date | null;
  detalhe: string | null;
};

async function limpar() {
  await owner!`DELETE FROM job_heartbeat WHERE job IN (${JOB_RETENCAO}, ${JOB_APP})`;
}

describe.skipIf(!hasDb)(
  "#536 · job_heartbeat — fronteira por função definer",
  () => {
    beforeAll(async () => {
      await owner!.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_JOB}') THEN
          CREATE ROLE ${LOGIN_JOB} LOGIN PASSWORD '${SENHA}' IN ROLE iris_retencao;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_ALARME}') THEN
          CREATE ROLE ${LOGIN_ALARME} LOGIN PASSWORD '${SENHA}' IN ROLE iris_alarme;
        END IF;
      END
      $$;
    `);
      await limpar();
    });

    afterAll(async () => {
      await limpar();
      await owner?.end();
    });

    test("1. role de job grava o SEU job; iris_alarme lê o que foi gravado", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      const alarme = postgres(urlComo(LOGIN_ALARME), { max: 1 });
      try {
        await job`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, true, 'avisados=2')`;
        const linhas = await alarme<
          Linha[]
        >`SELECT * FROM app_alarme_job_heartbeats()`;
        const linha = linhas.find((l) => l.job === JOB_RETENCAO);
        expect(linha).toBeDefined();
        expect(linha!.ultimo_ok).not.toBeNull();
        expect(linha!.ultimo_erro).toBeNull();
        expect(linha!.detalhe).toBe("avisados=2");
      } finally {
        await job.end();
        await alarme.end();
      }
    });

    test("2. falha avança ultimo_erro e PRESERVA ultimo_ok", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      try {
        const [antes] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB_RETENCAO}`;
        await job`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, false, 'erro=PostgresError code=42501')`;
        const [depois] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB_RETENCAO}`;
        expect(depois!.ultimo_erro).not.toBeNull();
        expect(depois!.ultimo_ok?.toISOString()).toBe(
          antes!.ultimo_ok?.toISOString(),
        );
        expect(depois!.detalhe).toBe("erro=PostgresError code=42501");
      } finally {
        await job.end();
      }
    });

    test("3. iris_alarme NÃO grava — 42501", async () => {
      const alarme = postgres(urlComo(LOGIN_ALARME), { max: 1 });
      try {
        await expect(
          alarme`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, true, '')`,
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await alarme.end();
      }
    });

    test("4. app_role NÃO lê a tabela direto (42501) — mas grava o job das rotas do app", async () => {
      const app = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        await expect(app`SELECT * FROM job_heartbeat`).rejects.toMatchObject({
          code: "42501",
        });
        await app`SELECT app_job_heartbeat_gravar(${JOB_APP}, true, 'processados=1')`;
        const [linha] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB_APP}`;
        expect(linha!.ultimo_ok).not.toBeNull();
      } finally {
        await app.end();
      }
    });

    test("5. MAPA job->role: app_role NÃO grava `retencao` (P0001) e nada muda na linha", async () => {
      const app = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        const [antes] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB_RETENCAO}`;
        await expect(
          app`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, true, 'forjado=1')`,
        ).rejects.toMatchObject({ code: "P0001" });
        const [depois] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB_RETENCAO}`;
        expect(depois!.ultimo_ok?.toISOString()).toBe(
          antes!.ultimo_ok?.toISOString(),
        );
        expect(depois!.detalhe).not.toBe("forjado=1");
      } finally {
        await app.end();
      }
    });

    test("6. MAPA job->role: iris_retencao NÃO grava `exportacao` (P0001)", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      try {
        await expect(
          job`SELECT app_job_heartbeat_gravar(${JOB_APP}, true, '')`,
        ).rejects.toMatchObject({ code: "P0001" });
      } finally {
        await job.end();
      }
    });

    test("7. job fora do mapa é P0001 mesmo para a dona; nome inválido e p_ok NULL idem", async () => {
      await expect(
        owner!`SELECT app_job_heartbeat_gravar('job-que-nao-existe', true, '')`,
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        owner!`SELECT app_job_heartbeat_gravar('Nome Com Espaço', true, '')`,
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        owner!`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, NULL, '')`,
      ).rejects.toMatchObject({ code: "P0001" });
    });

    test("8. role de job NÃO lê pela função do alarme — 42501", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      try {
        await expect(
          job`SELECT * FROM app_alarme_job_heartbeats()`,
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await job.end();
      }
    });

    test("9. detalhe é truncado a 200 caracteres no banco", async () => {
      await owner!`SELECT app_job_heartbeat_gravar(${JOB_RETENCAO}, true, ${"x".repeat(500)})`;
      const [linha] = await owner!<
        Linha[]
      >`SELECT * FROM job_heartbeat WHERE job = ${JOB_RETENCAO}`;
      expect(linha!.detalhe).toHaveLength(200);
    });

    test("10. o mapa da função cobre exatamente os jobs de LIMITES_HEARTBEAT + billing/escalonamento", async () => {
      const [row] = await owner!<{ prosrc: string }[]>`
      SELECT prosrc FROM pg_proc WHERE proname = 'app_job_heartbeat_gravar'
    `;
      for (const job of [
        "retencao",
        "arquivamento",
        "escalonamento",
        "expurgo-audit-log",
        "billing",
        "conciliacao",
        "exportacao",
        "asr",
        "asr-sweeper",
      ]) {
        expect(row!.prosrc).toContain(`WHEN '${job}'`);
      }
      expect(row!.prosrc).toContain("pg_has_role(session_user");
    });
  },
);
