/**
 * #536 (DA-03) — fronteira de acesso de `job_heartbeat` (migração 0143).
 *
 * O que se prova aqui, conectando como as roles REAIS (não como a dona, que é
 * BYPASSRLS e passaria com a migração certa ou errada):
 *  - uma role de job (`iris_retencao`) GRAVA via `app_job_heartbeat_gravar`;
 *  - `iris_alarme` LÊ via `app_alarme_job_heartbeats` e enxerga o que o job
 *    gravou — é isto que mata o defeito "GRANT sem policy devolve zero linhas
 *    sem erro";
 *  - `iris_alarme` NÃO grava (42501) e `app_role` NÃO lê a tabela direto
 *    (42501): o que cada role consegue é o que a função dela permite;
 *  - `p_ok=false` avança `ultimo_erro` e PRESERVA `ultimo_ok`;
 *  - nome de job inválido estoura P0001; `detalhe` é truncado a 200.
 *
 * Roles de LOGIN são criadas aqui, idempotentes, fora das migrações (mesmo
 * padrão de `alarme-jobs-rls.int.test.ts`). Limpeza por `DELETE` escopado.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const JOB = "teste-536";
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
      await owner!`DELETE FROM job_heartbeat WHERE job = ${JOB}`;
    });

    afterAll(async () => {
      await owner!`DELETE FROM job_heartbeat WHERE job = ${JOB}`;
      await owner?.end();
    });

    test("1. role de job grava; iris_alarme lê o que foi gravado", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      const alarme = postgres(urlComo(LOGIN_ALARME), { max: 1 });
      try {
        await job`SELECT app_job_heartbeat_gravar(${JOB}, true, 'avisados=2')`;
        const linhas = await alarme<
          Linha[]
        >`SELECT * FROM app_alarme_job_heartbeats()`;
        const linha = linhas.find((l) => l.job === JOB);
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
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB}`;
        await job`SELECT app_job_heartbeat_gravar(${JOB}, false, 'erro=PostgresError code=42501')`;
        const [depois] = await owner!<
          Linha[]
        >`SELECT * FROM job_heartbeat WHERE job = ${JOB}`;
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
          alarme`SELECT app_job_heartbeat_gravar(${JOB}, true, '')`,
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await alarme.end();
      }
    });

    test("4. app_role NÃO lê a tabela direto — 42501 (zero GRANT de tabela)", async () => {
      const app = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        await expect(app`SELECT * FROM job_heartbeat`).rejects.toMatchObject({
          code: "42501",
        });
        // ...mas grava pela função (rotas internas do app e asr-sweeper).
        await app`SELECT app_job_heartbeat_gravar(${JOB}, true, 'processados=1')`;
      } finally {
        await app.end();
      }
    });

    test("5. role de job NÃO lê pela função do alarme — 42501", async () => {
      const job = postgres(urlComo(LOGIN_JOB), { max: 1 });
      try {
        await expect(
          job`SELECT * FROM app_alarme_job_heartbeats()`,
        ).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await job.end();
      }
    });

    test("6. nome de job inválido estoura P0001 — nada gravado", async () => {
      await expect(
        owner!`SELECT app_job_heartbeat_gravar('Nome Com Espaço', true, '')`,
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        owner!`SELECT app_job_heartbeat_gravar(${JOB}, NULL, '')`,
      ).rejects.toMatchObject({ code: "P0001" });
    });

    test("7. detalhe é truncado a 200 caracteres no banco", async () => {
      await owner!`SELECT app_job_heartbeat_gravar(${JOB}, true, ${"x".repeat(500)})`;
      const [linha] = await owner!<
        Linha[]
      >`SELECT * FROM job_heartbeat WHERE job = ${JOB}`;
      expect(linha!.detalhe).toHaveLength(200);
    });
  },
);
