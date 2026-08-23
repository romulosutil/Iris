import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb } from "@tests/integration-env";
import { fecharOwnerDb, ownerDb } from "@tests/owner-db";

/**
 * Guard de deriva entre o `coletor.ts` e o schema real (#374 ∪ #353).
 *
 * Por que existe: o coletor declara as colunas de cada uma das 37 tabelas à mão
 * — proposital, é o mecanismo que exclui `cpf_hash` de `patient` e projeta
 * `app_user` só em id/name/email/created_at. O custo é que nada obrigava esses
 * nomes a existirem: **20 das 37 listas** citavam colunas inventadas
 * (`user_role.role`, `session.duracao_minutos`, `goal.titulo`,
 * `evidence.clinic_id`, …). O primeiro `SELECT` inválido derrubava a coleta
 * inteira com `42703 column ... does not exist`, para qualquer clínica, e a
 * suíte saía verde porque os testes de integração nunca chegavam a rodar.
 *
 * Este teste lê o próprio `coletor.ts` e confere cada coluna contra o
 * `information_schema` — não contra o `schema.ts`, que é a fonte que já estava
 * dessincronizada da cabeça de quem escreveu. Renomear coluna sem atualizar o
 * coletor passa a falhar aqui, não em produção.
 */

const CAMINHO_COLETOR = path.join(import.meta.dirname, "coletor.ts");

/** `SELECT <lista> FROM <tabela>` de cada bloco `sql\`\`` do coletor. */
function selectsDoColetor(
  fonte: string,
): { tabela: string; colunas: string[] }[] {
  const re = /SELECT\s+([\s\S]*?)\s+FROM\s+([a-z_][a-z0-9_]*)/gi;
  const achados: { tabela: string; colunas: string[] }[] = [];
  for (const m of fonte.matchAll(re)) {
    const [, listaBruta, tabela] = m;
    // Subquery de existência (`SELECT 1 FROM …`) e expressões não são projeção
    // de coluna; o que este guard cobre é a lista literal.
    if (listaBruta!.includes("(") || listaBruta!.trim() === "1") continue;
    const colunas = listaBruta!
      .split(",")
      .map((c) =>
        c
          .trim()
          .split(/\s+as\s+/i)[0]!
          .trim(),
      )
      // `rp.report_id` → `report_id`: o prefixo é alias do FROM/JOIN.
      .map((c) => (c.includes(".") ? c.slice(c.indexOf(".") + 1) : c))
      .filter((c) => c && c !== "*");
    achados.push({ tabela: tabela!, colunas });
  }
  return achados;
}

describe.skipIf(!hasDb)("coletor.ts × schema real — guard de deriva", () => {
  afterAll(fecharOwnerDb);

  it("toda coluna projetada pelo coletor existe na tabela correspondente", async () => {
    const fonte = readFileSync(CAMINHO_COLETOR, "utf8");
    const selects = selectsDoColetor(fonte);

    // Se a extração parar de casar (refatoração do coletor), o guard viraria um
    // teste vazio que passa por vacuidade. O piso mede que ele leu de verdade.
    expect(selects.length).toBeGreaterThanOrEqual(30);

    const linhas = (await ownerDb().execute(sql`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
    `)) as unknown as { table_name: string; column_name: string }[];

    const porTabela = new Map<string, Set<string>>();
    for (const { table_name, column_name } of linhas) {
      if (!porTabela.has(table_name)) porTabela.set(table_name, new Set());
      porTabela.get(table_name)!.add(column_name);
    }

    const problemas: string[] = [];
    for (const { tabela, colunas } of selects) {
      const existentes = porTabela.get(tabela);
      if (!existentes) {
        problemas.push(`${tabela}: tabela não existe no schema`);
        continue;
      }
      // Query com JOIN pode projetar coluna de qualquer tabela citada; aceita a
      // coluna se ela existe em alguma das tabelas do bloco.
      const faltando = colunas.filter(
        (c) =>
          !existentes.has(c) &&
          !colunaDeOutraTabelaDoBloco(fonte, tabela, c, porTabela),
      );
      if (faltando.length) {
        problemas.push(`${tabela}: ${faltando.join(", ")}`);
      }
    }

    expect(
      problemas,
      `colunas inexistentes:\n  ${problemas.join("\n  ")}`,
    ).toEqual([]);
  });
});

/**
 * Resolve coluna prefixada por alias em query com JOIN: aceita se a coluna
 * existe em qualquer tabela citada no mesmo bloco `FROM ... JOIN ...`.
 */
function colunaDeOutraTabelaDoBloco(
  fonte: string,
  tabelaBase: string,
  coluna: string,
  porTabela: Map<string, Set<string>>,
): boolean {
  const bloco = new RegExp(`FROM\\s+${tabelaBase}[\\s\\S]*?(?=\`)`, "i").exec(
    fonte,
  )?.[0];
  if (!bloco) return false;
  const tabelasCitadas = [
    ...bloco.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi),
  ]
    .map((m) => m[1]!)
    .filter((t) => t !== tabelaBase);
  return tabelasCitadas.some((t) => porTabela.get(t)?.has(coluna));
}
