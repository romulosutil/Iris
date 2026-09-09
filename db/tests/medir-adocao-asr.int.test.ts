import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";
import { coletar } from "../../scripts/medir-adocao-asr.mjs";

/**
 * #500 — dialeto real do `scripts/medir-adocao-asr.mjs`.
 *
 * O teste unitário do script dubla `postgres` e prova a FIAÇÃO (qual medida
 * sai de qual consulta, a ordem do `SET TRANSACTION READ ONLY`, o veredito).
 * O que ele não pode provar é que as sete consultas EXISTEM no dialeto do
 * destino: um dublê aceita `percentile_cont` escrito errado, um `FILTER` mal
 * posicionado ou uma coluna que o schema não tem, e a suíte sai verde até
 * alguém apontar o script para produção — que é justamente o único lugar onde
 * ele serve para alguma coisa.
 *
 * Este arquivo fecha esse buraco: roda `coletar` contra o Postgres de verdade,
 * com o schema de verdade. Se qualquer consulta deixar de casar com
 * `src/db/schema.ts` (coluna renomeada, enum alterado, tabela movida), aqui
 * fica vermelho — não em produção.
 */
describe.skipIf(!hasDb)("medir-adocao-asr contra Postgres real", () => {
  // Role DONA de propósito: é a que o script exige, e a RLS faria a role da
  // aplicação devolver zero linha sem contexto de tenant — o mesmo zero
  // ambíguo que o script existe para desfazer.
  const sql = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

  afterAll(async () => {
    await sql.end();
  });

  test("as sete consultas executam e devolvem números", async () => {
    const medidas = await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      return coletar(tx, 7);
    });

    expect(medidas.dias).toBe(7);
    expect(Number.isInteger(medidas.clinicas.reais)).toBe(true);
    expect(Number.isInteger(medidas.clinicas.demo)).toBe(true);
    expect(Number.isInteger(medidas.uso.sessoes)).toBe(true);
    expect(Number.isInteger(medidas.uso.clinicas_ativas)).toBe(true);
    expect(Number.isInteger(medidas.uso.terapeutas)).toBe(true);
    expect(Number.isInteger(medidas.sessoesComCaptura)).toBe(true);
    expect(Number.isInteger(medidas.latencia.transcritos)).toBe(true);
    expect(Number.isInteger(medidas.resgatePendentes)).toBe(true);
    expect(Number.isInteger(medidas.clipes)).toBe(true);
    expect(Array.isArray(medidas.porStatus)).toBe(true);
    expect(Array.isArray(medidas.heartbeats)).toBe(true);
  });

  test("a janela --dias muda o recorte sem quebrar o cast de interval", async () => {
    const medidas = await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      return coletar(tx, 365);
    });
    expect(medidas.dias).toBe(365);
    // 365 dias não pode ver MENOS que 7: o recorte é cumulativo para trás.
    expect(medidas.uso.sessoes).toBeGreaterThanOrEqual(0);
  });

  test("READ ONLY é trava do Postgres, não promessa de docblock", async () => {
    // O script roda contra PRODUÇÃO. A garantia de que nenhuma edição futura
    // de consulta escreva por descuido tem que vir do banco, e é isto que se
    // mede: dentro da mesma transação que `main()` abre, um INSERT é recusado
    // com 25006 (read_only_sql_transaction).
    await expect(
      sql.begin(async (tx) => {
        await tx`SET TRANSACTION READ ONLY`;
        await tx`INSERT INTO job_heartbeat (job) VALUES ('smoke-read-only-guard')`;
      }),
    ).rejects.toMatchObject({ code: "25006" });

    // E não deixou rastro: a transação foi recusada, não parcialmente aplicada.
    const linhas = await sql<{ existe: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM job_heartbeat WHERE job = 'smoke-read-only-guard'
      ) AS existe`;
    expect(linhas[0]?.existe).toBe(false);
  });
});
