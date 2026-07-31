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
 * Review round 2, item 8 (reaberto): a correção acima seguia gravando uma
 * CÓPIA colada do `UPDATE` da migração — passaria idêntico mesmo se a
 * migração 0059 nunca tivesse existido, porque o teste testava o próprio
 * UPDATE que ele mesmo escreve, não o efeito do arquivo. Este teste agora lê
 * o predicado `WHERE` de `db/migrations/0059_email_verificado_backfill.sql`
 * DO DISCO (não uma cópia) e roda esse predicado — combinado com `AND id =
 * ...` só para não afetar linhas de outras suítes rodando na mesma execução
 * serial (test:rls) — contra uma conta "congelada no tempo" (formato de
 * conta legada, semeada via conexão dona, fora do caminho da aplicação).
 * Se alguém enfraquecer o predicado da migração (ex.: trocar `false` por
 * `true`, ou remover a cláusula), este teste fica VERMELHO — provado por
 * mutação abaixo, no relatório da rodada.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_PATH = join(
  process.cwd(),
  "db/migrations/0059_email_verificado_backfill.sql",
);

/**
 * Lê o predicado `WHERE` do `UPDATE` da migração 0059 diretamente do
 * arquivo em disco — não uma cópia colada no teste. Falha ruidosamente se o
 * arquivo não existir mais ou não tiver mais a forma `UPDATE ... WHERE
 * ...;` esperada, em vez de silenciosamente deixar de testar nada.
 */
function lerPredicadoWhereDoBackfill(): string {
  const conteudo = readFileSync(MIGRATION_PATH, "utf8");
  const semComentarios = conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--") && linha.trim() !== "")
    .join(" ")
    .trim();

  const match = semComentarios.match(/UPDATE\s+app_user\s+SET\s+email_verified\s*=\s*true\s+WHERE\s+(.+?);?\s*$/i);
  if (!match) {
    throw new Error(
      `verificacao.int.test.ts: não conseguiu extrair o predicado WHERE de ${MIGRATION_PATH} — conteúdo: ${JSON.stringify(conteudo)}`,
    );
  }
  return match[1]!.replace(/;$/, "").trim();
}

describe("backfill de verificação de e-mail (migração 0059)", () => {
  const owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

  afterAll(async () => {
    await owner.end();
  });

  it("uma conta legada (email_verified = false, pré-existente) sai verificada ao rodar o predicado real da migração 0059", async () => {
    const email = `legado-${Date.now()}@exemplo.com.br`;
    const [legado] = await owner`
      INSERT INTO app_user (name, email, email_verified)
      VALUES ('Conta Legada', ${email}, false)
      RETURNING id
    `;

    try {
      const wherePredicate = lerPredicadoWhereDoBackfill();

      // Roda o predicado LIDO DO ARQUIVO (não uma cópia), escopado por
      // `AND id = ...` para não flipar, de brinde, contas não-verificadas
      // de OUTRAS suítes rodando na mesma execução serial — o alvo é esta
      // linha legada, não a tabela inteira.
      await owner.unsafe(
        `UPDATE app_user SET email_verified = true WHERE (${wherePredicate}) AND id = $1`,
        [legado!.id],
      );

      const [depois] = await owner`
        SELECT email_verified FROM app_user WHERE id = ${legado!.id}
      `;
      expect(depois!.email_verified).toBe(true);
    } finally {
      await owner`DELETE FROM app_user WHERE id = ${legado!.id}`;
    }
  });
});
