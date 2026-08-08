/**
 * Integridade do manifesto de migrações (débito D2, issue #187).
 *
 * O Drizzle não aplica os arquivos `.sql` que encontra em disco: ele aplica o
 * que está listado em `db/migrations/meta/_journal.json`, na ordem do campo
 * `when`. Isso cria três formas de uma migração "existir no repo" e mesmo
 * assim nunca rodar — todas com o mesmo sintoma: silêncio.
 *
 *  1. Arquivo `.sql` sem entrada no journal → o Drizzle nem sabe que existe.
 *  2. Entrada no journal sem `.sql` em disco → `pnpm db:migrate` estoura em
 *     produção, não no PR.
 *  3. `when` menor ou igual ao da última migração já aplicada → o Drizzle
 *     **pula o arquivo sem erro e sem aviso**. Foi exatamente assim que a
 *     `0055` (fix de isolamento cross-tenant, #128) nunca rodou em produção e
 *     a issue foi fechada olhando o diff (#165).
 *
 * Migração à mão exige entrada manual no journal — ver `CLAUDE.md`. Este teste
 * é o guardrail que transforma esse "exige" em falha de CI.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

const journal: { version: string; dialect: string; entries: JournalEntry[] } =
  JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));

const sqlTags = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -".sql".length))
  .sort();

describe("integridade de db/migrations", () => {
  it("tem pelo menos uma migração e uma entrada no journal", () => {
    expect(sqlTags.length).toBeGreaterThan(0);
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("todo arquivo .sql tem entrada correspondente no _journal.json", () => {
    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const semEntrada = sqlTags.filter((tag) => !journalTags.has(tag));
    expect(
      semEntrada,
      "arquivo .sql sem entrada no journal nunca é aplicado pelo Drizzle — " +
        "acrescente a entrada com `when` = anterior + 1000",
    ).toEqual([]);
  });

  it("não há entrada órfã no _journal.json (sem .sql em disco)", () => {
    const emDisco = new Set(sqlTags);
    const orfas = journal.entries
      .map((e) => e.tag)
      .filter((tag) => !emDisco.has(tag));
    expect(
      orfas,
      "entrada no journal sem o .sql correspondente quebra `pnpm db:migrate` " +
        "em produção, não no PR",
    ).toEqual([]);
  });

  it("a sequência de `when` é estritamente crescente", () => {
    const foraDeOrdem: string[] = [];
    for (let i = 1; i < journal.entries.length; i++) {
      const anterior = journal.entries[i - 1]!;
      const atual = journal.entries[i]!;
      if (atual.when <= anterior.when) {
        foraDeOrdem.push(
          `${atual.tag} (when=${atual.when}) <= ${anterior.tag} (when=${anterior.when})`,
        );
      }
    }
    expect(
      foraDeOrdem,
      "`when` menor ou igual ao anterior faz o Drizzle pular a migração em " +
        "silêncio (incidente da 0055, #128/#165). Use anterior + 1000.",
    ).toEqual([]);
  });

  it("não há `when` duplicado", () => {
    const vistos = new Map<number, string>();
    const duplicados: string[] = [];
    for (const entry of journal.entries) {
      const anterior = vistos.get(entry.when);
      if (anterior !== undefined) {
        duplicados.push(
          `${entry.tag} colide com ${anterior} (when=${entry.when})`,
        );
      } else {
        vistos.set(entry.when, entry.tag);
      }
    }
    expect(duplicados).toEqual([]);
  });

  it("`idx` é sequencial a partir de 0 e casa com a posição no array", () => {
    const divergentes = journal.entries
      .map((e, i) => (e.idx === i ? null : `posição ${i} tem idx=${e.idx}`))
      .filter((v): v is string => v !== null);
    expect(divergentes).toEqual([]);
  });

  it("toda tag segue o formato `NNNN_nome` e o prefixo casa com o `idx`", () => {
    const invalidas: string[] = [];
    for (const entry of journal.entries) {
      const match = /^(\d{4})_[a-z0-9_]+$/.exec(entry.tag);
      if (!match) {
        invalidas.push(`${entry.tag}: fora do formato NNNN_nome_snake_case`);
        continue;
      }
      if (Number(match[1]) !== entry.idx) {
        invalidas.push(
          `${entry.tag}: prefixo ${match[1]} não corresponde ao idx ${entry.idx}`,
        );
      }
    }
    expect(invalidas).toEqual([]);
  });

  it("o journal declara o dialeto postgresql", () => {
    expect(journal.dialect).toBe("postgresql");
  });
});
