/**
 * Guard de repositório — #222.
 *
 * Trunca-se tabela de referência UMA vez e o estrago fica no banco local para
 * sempre: nada repõe o seed da migração, e o arquivo que quebra é outro, com um
 * erro de FK que não aponta para o culpado. O custo de diagnóstico é alto e o
 * sintoma depende da ORDEM de execução — exatamente a classe de falha que faz
 * "verde" parar de significar alguma coisa.
 *
 * Por isso o guard é estático (roda em `pnpm test`, sem banco): ele não espera o
 * sintoma aparecer numa ordem infeliz, ele proíbe a causa no diff.
 *
 * Se você precisa que uma família de protocolo exista, SEMEIE a sua com
 * `INSERT ... ON CONFLICT (id) DO NOTHING` — nunca limpe o catálogo.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REFERENCE_TABLES } from "./reference-data";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
/** `.worktrees/` são cópias de outras branches — não são o código desta. */
const SCAN_DIRS = ["src", path.join("db", "tests"), "scripts"];

function arquivosDeTeste(): string[] {
  const out: string[] = [];
  for (const dir of SCAN_DIRS) {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, dir), {
        recursive: true,
        withFileTypes: true,
      });
    } catch {
      continue; // diretório ausente não é violação
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(test|int\.test)\.ts$/.test(e.name)) continue;
      out.push(path.join(e.parentPath, e.name));
    }
  }
  return out;
}

/**
 * Statements TRUNCATE do arquivo. Um TRUNCATE lista tabelas separadas por
 * vírgula até uma palavra-chave de fim (RESTART/CONTINUE/CASCADE/RESTRICT) ou
 * o fim do statement — é essa lista que interessa, não o arquivo inteiro (o
 * nome da tabela aparece legitimamente em INSERT/SELECT).
 */
function tabelasTruncadas(src: string): string[] {
  const tabelas: string[] = [];
  const re =
    /TRUNCATE\s+(?:TABLE\s+)?([\s\S]*?)(?:RESTART|CONTINUE|CASCADE|RESTRICT|`|;)/gi;
  for (const m of src.matchAll(re)) {
    for (const t of (m[1] ?? "").split(",")) {
      const nome = t.trim().replace(/^(?:ONLY\s+)?(?:public\.)?/i, "");
      if (nome) tabelas.push(nome.toLowerCase());
    }
  }
  return tabelas;
}

describe("guard: testes não truncam dado de referência (#222)", () => {
  test("nenhum TRUNCATE inclui tabela de referência", () => {
    const violacoes: string[] = [];
    for (const file of arquivosDeTeste()) {
      const truncadas = tabelasTruncadas(readFileSync(file, "utf8"));
      for (const ref of REFERENCE_TABLES) {
        if (truncadas.includes(ref)) {
          violacoes.push(`${path.relative(ROOT, file)} → TRUNCATE ${ref}`);
        }
      }
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });

  test("o próprio detector enxerga um TRUNCATE multi-linha", () => {
    // Sem isto, um regex quebrado deixaria a suíte verde sem checar nada.
    const amostra =
      "await owner`TRUNCATE clinic, app_user,\n  protocol_familia_catalogo, goal RESTART IDENTITY CASCADE`";
    expect(tabelasTruncadas(amostra)).toContain("protocol_familia_catalogo");
    expect(tabelasTruncadas("SELECT * FROM protocol_familia_catalogo")).toEqual(
      [],
    );
  });
});
