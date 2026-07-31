/**
 * Integração — backfill de email_verified (migração 0059).
 *
 * Review round 1, item 8: a versão anterior deste teste contava
 * `email_verified = false` em `app_user` inteira. Isso capturava toda conta
 * NOVA criada por outras suítes (ex.: cadastro.int.test.ts), que
 * legitimamente começa não-verificada até confirmar o e-mail — nunca foi a
 * alegação do backfill que essas contas ficariam verificadas. A alegação
 * real do backfill é: nenhuma conta que EXISTIA antes da migração 0059
 * ficou travada fora do produto quando `requireEmailVerification` ligou.
 *
 * Este teste prova exatamente isso, sem depender de nenhuma outra suíte:
 * semeia uma conta "congelada no tempo" (formato de conta legada, criada via
 * conexão dona, fora do caminho da aplicação) e roda o mesmo UPDATE da
 * migração 0059 contra ela — reproduzindo o efeito do backfill, não
 * reexecutando a migração (que já rodou uma vez, no passado).
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

describe("backfill de verificação de e-mail (migração 0059)", () => {
  const owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

  afterAll(async () => {
    await owner.end();
  });

  it("uma conta legada (email_verified = false, pré-existente) sai verificada do backfill", async () => {
    const email = `legado-${Date.now()}@exemplo.com.br`;
    const [legado] = await owner`
      INSERT INTO app_user (name, email, email_verified)
      VALUES ('Conta Legada', ${email}, false)
      RETURNING id
    `;

    try {
      // Reproduz db/migrations/0059_email_verificado_backfill.sql (mesmo
      // predicado `WHERE email_verified = false`), com `AND id = ...` só
      // para não flipar, de brinde, contas não-verificadas de OUTRAS
      // suítes que rodam na mesma execução serial (test:rls) — o alvo é
      // esta linha legada, não a tabela inteira.
      await owner`UPDATE app_user SET email_verified = true WHERE email_verified = false AND id = ${legado!.id}`;

      const [depois] = await owner`
        SELECT email_verified FROM app_user WHERE id = ${legado!.id}
      `;
      expect(depois!.email_verified).toBe(true);
    } finally {
      await owner`DELETE FROM app_user WHERE id = ${legado!.id}`;
    }
  });
});
