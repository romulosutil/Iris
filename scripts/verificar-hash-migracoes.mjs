/**
 * Guard de deriva de migração já aplicada (D17, #215).
 *
 * O Drizzle aplica por `tag` do journal e nunca reexecuta um tag já
 * registrado em `drizzle.__drizzle_migrations` — editar um `.sql` já
 * aplicado não dá erro, não dá aviso e não roda (precedente: a `0073`
 * editada pelo commit `b53b294` depois de já aplicada, corrigido só na
 * `0082` recriando o conteúdo como migração nova). Base criada do zero
 * (dev, CI) roda o `.sql` como está hoje; base que veio migrando (produção)
 * ficou com o que rodou no dia — e o `git diff` mostra o código certo nos
 * dois, porque o arquivo em disco é o mesmo.
 *
 * Este guard compara, para cada linha já aplicada, o hash gravado no banco
 * (sha256 do conteúdo tal como o Drizzle o leu no momento da aplicação) com
 * o sha256 do arquivo em disco agora — mesmo algoritmo do `readMigrationFiles`
 * de `drizzle-orm/migrator` (sha256 hex do `.sql` bruto, sem normalizar
 * quebra de linha nem remover `--> statement-breakpoint`).
 *
 * Roda dentro de `scripts/migrate.mjs`, ANTES de aplicar migração nova —
 * diverge → aborta o deploy (mesmo gate que já existe para falha de DDL).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export function calcularHashMigracao(conteudo) {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Função pura: recebe as entradas do journal e as linhas já aplicadas no
 * banco (`{ hash, created_at }`), devolve as que divergem. `lerConteudo` é
 * injetável para o teste unitário não depender de arquivo em disco.
 */
export function encontrarMigracoesComHashDivergente(
  journalEntries,
  linhasAplicadas,
  lerConteudo,
) {
  const tagPorWhen = new Map(
    journalEntries.map((entry) => [Number(entry.when), entry.tag]),
  );
  const divergentes = [];

  for (const linha of linhasAplicadas) {
    const tag = tagPorWhen.get(Number(linha.created_at));
    // Sem entrada correspondente no journal: fora do escopo deste guard —
    // é o `_journal.json` órfão que o D2 (`src/db/migrations.test.ts`) cobre.
    if (!tag) continue;

    const hashEsperado = calcularHashMigracao(lerConteudo(tag));
    if (hashEsperado !== linha.hash) {
      divergentes.push({ tag, hashAplicado: linha.hash, hashEsperado });
    }
  }

  return divergentes;
}

/**
 * Efeito colateral: lê `db/migrations/meta/_journal.json` e
 * `drizzle.__drizzle_migrations` de verdade e aplica o comparador puro
 * acima. Devolve `[]` quando a tabela ainda não existe (primeiro deploy,
 * nada aplicado ainda) — não é divergência, é ausência de histórico.
 */
export async function verificarHashesAplicadas(
  sql,
  migrationsDir = path.resolve(process.cwd(), "db/migrations"),
) {
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  let linhasAplicadas;
  try {
    linhasAplicadas = await sql`select hash, created_at from drizzle.__drizzle_migrations`;
  } catch (err) {
    if (err?.code === "42P01") return []; // relation does not exist
    throw err;
  }

  return encontrarMigracoesComHashDivergente(
    journal.entries,
    linhasAplicadas,
    (tag) => readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf8"),
  );
}
