/**
 * Integração (#453) — trilha de auditoria do coordenador.
 *
 * Prova as três fronteiras que a tela depende e que nenhum teste unitário
 * alcança: isolamento de tenant, separação de papel entre a tabela base e a view
 * `audit_log_mascarado` (`0046`), e paginação real contra o banco.
 *
 * Fixtures com e-mails exclusivos deste arquivo (`@gov453.test`) e limpeza por
 * DELETE escopado, não `TRUNCATE`: literais genéricos como `coord@a.test` são
 * reusados por mais de uma dúzia de int-tests, e o `UNIQUE(email)` estoura em
 * paralelo — a falha aparece no `setup` e se lê como defeito de RLS.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { sql as appSql, authSql } from "../../src/db/client";
import { lerPaginaTrilha } from "../../src/app/(app)/clinica/auditoria/queries";
import { ITENS_POR_PAGINA } from "../../src/app/(app)/clinica/auditoria/logic";
import { hasDb } from "./integration-env";

const CLINIC_A = "453a0000-0000-4000-8000-00000000000a";
const CLINIC_B = "453b0000-0000-4000-8000-00000000000b";
const U_COORD_A = "45310000-0000-4000-8000-000000000001";
const U_RECEP_A = "45310000-0000-4000-8000-000000000002";
const U_TERA_A = "45310000-0000-4000-8000-000000000003";
const U_COORD_B = "45310000-0000-4000-8000-000000000004";
const P_A = "453c0000-0000-4000-8000-00000000000c";

const TOTAL_A = ITENS_POR_PAGINA + 2;

const ctx = (role: TenantContext["role"], userId: string, clinicId: string) =>
  ({ role, userId, clinicId }) satisfies TenantContext;

let owner: ReturnType<typeof postgres>;

async function limpar() {
  await owner`DELETE FROM audit_log WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM app_user WHERE email LIKE '%@gov453.test'`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
}

describe.skipIf(!hasDb)("#453 — trilha de auditoria", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await limpar();

    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Gov453 A'), (${CLINIC_B}, 'Gov453 B')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord@gov453.test'),
      (${U_RECEP_A}, 'Recep A', 'recep@gov453.test'),
      (${U_TERA_A}, 'Tera A', 'tera@gov453.test'),
      (${U_COORD_B}, 'Coord B', 'coordb@gov453.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_RECEP_A}, ${CLINIC_A}, 'admin_recepcao'),
      (${U_TERA_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${P_A}, ${CLINIC_A}, 'Paciente Gov453')`;

    // A trilha é imutável para o `app_role`; só a role dona escreve aqui.
    // `criado_em` decrescente e distinto por linha para que a ordem da
    // paginação seja determinística.
    for (let i = 0; i < TOTAL_A; i++) {
      await owner`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe, criado_em)
        VALUES (${CLINIC_A}, ${U_COORD_A}, 'paciente_arquivado', 'patient', ${P_A}, ${P_A},
                jsonb_build_object('segredo', 'nao_pode_vazar'), now() - (${i} || ' minutes')::interval)`;
    }
    await owner`INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id)
      VALUES (${CLINIC_B}, ${U_COORD_B}, 'paciente_arquivado', 'patient', ${CLINIC_B})`;
  });

  afterAll(async () => {
    await limpar();
    await owner?.end();
    await appSql.end();
    await authSql.end();
  });

  test("coordenador lê a trilha da própria clínica e não a da outra", async () => {
    const pagina = await lerPaginaTrilha(
      ctx("coordenador", U_COORD_A, CLINIC_A),
      1,
    );
    expect(pagina.total).toBe(TOTAL_A);

    const outra = await lerPaginaTrilha(
      ctx("coordenador", U_COORD_B, CLINIC_B),
      1,
    );
    expect(outra.total).toBe(1);
  });

  test("paginação é real: a página 2 traz o resto, sem repetir a 1", async () => {
    const c = ctx("coordenador", U_COORD_A, CLINIC_A);
    const p1 = await lerPaginaTrilha(c, 1);
    const p2 = await lerPaginaTrilha(c, 2);

    expect(p1.linhas).toHaveLength(ITENS_POR_PAGINA);
    expect(p2.linhas).toHaveLength(TOTAL_A - ITENS_POR_PAGINA);

    const ids = new Set([...p1.linhas, ...p2.linhas].map((l) => l.id));
    expect(ids.size).toBe(TOTAL_A);
  });

  test("página além do fim grampeia na última, em vez de mentir 'sem registros'", async () => {
    const pagina = await lerPaginaTrilha(
      ctx("coordenador", U_COORD_A, CLINIC_A),
      999,
    );
    expect(pagina.paginaAtual).toBe(2);
    expect(pagina.linhas.length).toBeGreaterThan(0);
  });

  test("a linha renderizada traduz o slug e não carrega PII", async () => {
    const pagina = await lerPaginaTrilha(
      ctx("coordenador", U_COORD_A, CLINIC_A),
      1,
    );
    const linha = pagina.linhas[0]!;

    expect(linha.acao).toBe("Paciente arquivado");
    expect(linha.entidade).toBe("Paciente");
    expect(linha.ator).toBe("Coord A");
    // Nem `detalhe`, nem `patient_id`, nem `entidade_id` chegam ao objeto.
    expect(Object.keys(linha).sort()).toEqual(
      ["acao", "ator", "entidade", "id", "quando"].sort(),
    );
    expect(JSON.stringify(pagina.linhas)).not.toContain("nao_pode_vazar");
    expect(JSON.stringify(pagina.linhas)).not.toContain(P_A);
  });

  test("a view não expõe as colunas clínicas — não é disciplina do `select`", async () => {
    await expect(
      withTenant(ctx("coordenador", U_COORD_A, CLINIC_A), (tx) =>
        tx.execute(sql`SELECT detalhe FROM audit_log_mascarado LIMIT 1`),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(ctx("coordenador", U_COORD_A, CLINIC_A), (tx) =>
        tx.execute(sql`SELECT patient_id FROM audit_log_mascarado LIMIT 1`),
      ),
    ).rejects.toThrow();
  });

  /**
   * A separação da `0046`, medida nas duas direções. A recepção lê a trilha
   * mascarada, mas a tabela base — que tem `patient_id` e `detalhe` — continua
   * coordenador-only. Sem este par, "a recepção lê pela view" seria uma escolha
   * de código, não uma fronteira do banco.
   */
  test("admin_recepcao lê pela view e NÃO pela tabela base", async () => {
    const c = ctx("admin_recepcao", U_RECEP_A, CLINIC_A);

    const pagina = await lerPaginaTrilha(c, 1);
    expect(pagina.total).toBe(TOTAL_A);

    const base = (await withTenant(c, (tx) =>
      tx.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total FROM audit_log`,
      ),
    )) as unknown as { total: number }[];
    expect(Number(base[0]!.total)).toBe(0);
  });

  test("coordenador lê a tabela base — a policy da 0046 não foi afrouxada", async () => {
    const base = (await withTenant(
      ctx("coordenador", U_COORD_A, CLINIC_A),
      (tx) =>
        tx.execute<{ total: number }>(
          sql`SELECT count(*)::int AS total FROM audit_log`,
        ),
    )) as unknown as { total: number }[];
    expect(Number(base[0]!.total)).toBe(TOTAL_A);
  });

  /**
   * O índice da `0120` existe para que a fatia leia só as linhas da clínica.
   * Sem ele — ou se um refactor mudar a consulta de um jeito que o planner
   * deixe de escolhê-lo — a fatia passa a varrer a trilha de **todas** as
   * clínicas: medido em 20k linhas, 10 ms contra 688 ms.
   *
   * Isso não se prova lendo o SQL — se prova pedindo o plano. Com as ~52 linhas
   * das outras asserções o planner escolheria seq scan de qualquer forma (tabela
   * pequena), então este teste semeia volume próprio e o remove ao fim.
   *
   * A asserção é a escolha de acesso, não a contagem de linhas: como
   * `audit_log_mascarado` é `security_barrier`, o `LIMIT` **não** desce abaixo
   * da view — a fatia sempre lê as linhas da clínica e faz top-N sort. O que o
   * índice decide é se essas linhas vêm por `Index Scan` (só a clínica) ou por
   * `Seq Scan` (a trilha de todas as clínicas). Medido em 20k linhas: 10 ms
   * contra 688 ms.
   */
  test("a fatia entra pelo índice, não por Seq Scan da trilha inteira", async () => {
    const CLINIC_VOL = "453d0000-0000-4000-8000-00000000000d";
    try {
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_VOL}, 'Gov453 Volume')`;
      await owner`
        INSERT INTO audit_log (clinic_id, acao, entidade, entidade_id, criado_em)
        SELECT ${CLINIC_VOL}, 'paciente_arquivado', 'patient', gen_random_uuid(),
               now() - (g || ' minutes')::interval
          FROM generate_series(1, 20000) g`;
      await owner`ANALYZE audit_log`;

      const plano = (await withTenant(
        ctx("coordenador", U_COORD_A, CLINIC_VOL),
        (tx) =>
          tx.execute<{ "QUERY PLAN": string }>(sql`
            EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
            SELECT a.id, a.criado_em, a.acao, a.entidade, u.name AS ator_nome
              FROM (
                     SELECT id, criado_em, acao, entidade, ator_id
                       FROM audit_log_mascarado
                      ORDER BY criado_em DESC NULLS LAST, id DESC NULLS LAST
                      LIMIT ${ITENS_POR_PAGINA} OFFSET 0
                   ) a
              LEFT JOIN app_user u ON u.id = a.ator_id
             ORDER BY a.criado_em DESC NULLS LAST, a.id DESC NULLS LAST`),
      )) as unknown as { "QUERY PLAN": string }[];

      const texto = plano.map((l) => l["QUERY PLAN"]).join("\n");
      expect(texto).toContain("idx_audit_log_clinic_criado");
      expect(texto).not.toMatch(/Seq Scan on audit_log\b/);
    } finally {
      await owner`DELETE FROM audit_log WHERE clinic_id = ${CLINIC_VOL}`;
      await owner`DELETE FROM clinic WHERE id = ${CLINIC_VOL}`;
      await owner`ANALYZE audit_log`;
    }
  });

  test("terapeuta não vê a trilha nem pela view", async () => {
    const pagina = await lerPaginaTrilha(
      ctx("terapeuta", U_TERA_A, CLINIC_A),
      1,
    );
    expect(pagina.total).toBe(0);
    expect(pagina.linhas).toEqual([]);
  });
});
