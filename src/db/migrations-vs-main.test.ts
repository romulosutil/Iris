/**
 * Guards de migração contra `origin/main` (task CI — fecha o buraco que
 * `migrations.test.ts` deixa aberto).
 *
 * `migrations.test.ts` só valida consistência DENTRO do journal local: `when`
 * crescente entre si, sem duplicata, tag casando com `.sql` em disco. Isso
 * passa verde numa base limpa mesmo quando o PR reusa um `when` que já foi
 * MERGEADO em `main` por outro PR — porque naquela base isolada tudo aplica
 * na ordem do próprio journal. O bug só aparece contra uma base que já tem as
 * migrações de `main` (ou seja: produção). Foi exatamente isso que aconteceu
 * nos PRs #305 e #306 no mesmo dia — os dois escreveram
 * `when: 1786625656975`, enquanto `origin/main` já estava em
 * `1786736757645`. O que mergear por último aplica sem erro (Drizzle não
 * reclama de `when` "só um pouco" fora de ordem se ainda for maior que o
 * anterior NO JOURNAL DELE), mas reintroduz o padrão que gerou a #165: um
 * `when` baixo demais fica silenciosamente pulável pelo próximo hand-migration
 * mal calculado.
 *
 * Guard 1 (abaixo) compara cada entrada NOVA do journal local contra o maior
 * `when` já presente em `origin/main` — não só contra o vizinho anterior no
 * próprio array.
 *
 * Guard 2 cobre o outro lado do mesmo incidente: nos PRs #305/#306 o
 * `db/migrations/meta/NNNN_snapshot.json` que devia acompanhar a mudança em
 * `src/db/schema.ts` ficou de fora do diff. Sem o snapshot, o PRÓXIMO
 * `pnpm db:generate` (de outra pessoa, meses depois) recalcula o diff a
 * partir do snapshot ANTIGO e regenera DDL duplicado — e o estágio `migrate`
 * do Dockerfile aborta o deploy tentando recriar algo que já existe.
 *
 * As duas guards precisam de `origin/main` alcançável localmente (via
 * `git fetch origin main` antes de rodar). Em CI isso é garantido pelo
 * checkout com fetch-depth adequado (ver `.github/workflows/ci.yml`). Fora de
 * CI — clone raso, sem remoto `origin`, sem rede — a ausência do ref não pode
 * ser tratada como falha: degradam com aviso, não travam a máquina de
 * ninguém.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = path.resolve(REPO_ROOT, "db/migrations");
const META_DIR = path.join(MIGRATIONS_DIR, "meta");
const JOURNAL_PATH = path.join(META_DIR, "_journal.json");
const MAIN_REF = process.env.CI_BASE_REF ?? "origin/main";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = { version: string; dialect: string; entries: JournalEntry[] };

function readLocalJournal(): Journal {
  return JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Resolve o journal de `origin/main` via `git show`, sem tocar no working
 * tree. Retorna `null` (não lança) quando o ref não existe localmente — quem
 * chama decide se isso é "pular com aviso" ou "falhar" (aqui é sempre pular:
 * ver cabeçalho do arquivo).
 */
function tryReadMainJournal(): Journal | null {
  try {
    const raw = git(["show", `${MAIN_REF}:db/migrations/meta/_journal.json`]);
    return JSON.parse(raw) as Journal;
  } catch {
    return null;
  }
}

function tryListMainMetaFiles(): string[] | null {
  try {
    const raw = git(["ls-tree", "--name-only", `${MAIN_REF}:db/migrations/meta`]);
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function trySchemaChangedVsMain(): boolean | null {
  try {
    const raw = git(["diff", "--name-only", MAIN_REF, "--", "src/db/schema.ts"]);
    return raw.trim().length > 0;
  } catch {
    return null;
  }
}

const mainJournal = tryReadMainJournal();
const mainAvailable = mainJournal !== null;

describe("integridade de db/migrations contra origin/main", () => {
  it("origin/main está disponível para comparação (aviso, não falha, se não estiver)", () => {
    if (!mainAvailable) {
      console.warn(
        `[migrations-vs-main] não consegui ler ${MAIN_REF} via 'git show' — ` +
          "rode 'git fetch origin main' para habilitar este guard localmente. " +
          "Em CI isso é garantido pelo checkout; se este aviso aparecer lá, o " +
          "workflow está mal configurado.",
      );
    }
    // Sempre passa: esta asserção só existe pra deixar o aviso visível no
    // relatório de teste sem reprovar o dev sem rede.
    expect(true).toBe(true);
  });

  it.skipIf(!mainAvailable)(
    "toda migração NOVA (ausente em origin/main) tem `when` estritamente maior que o maior `when` de origin/main",
    () => {
      const local = readLocalJournal();
      const mainTags = new Set(mainJournal!.entries.map((e) => e.tag));
      const maxWhenMain = mainJournal!.entries.reduce(
        (max, e) => Math.max(max, e.when),
        0,
      );

      const novas = local.entries.filter((e) => !mainTags.has(e.tag));
      const regressivas = novas
        .filter((e) => e.when <= maxWhenMain)
        .map(
          (e) =>
            `${e.tag} (when=${e.when}) <= maior when de origin/main (${maxWhenMain}). ` +
            `Use ${maxWhenMain + 1000} ou maior — quem mergear por último com ` +
            `um when baixo demais fica pulável pelo próximo hand-migration (#165, #305, #306).`,
        );

      expect(regressivas).toEqual([]);
    },
  );

  it.skipIf(!mainAvailable)(
    "se src/db/schema.ts mudou em relação a origin/main, existe snapshot novo commitado em db/migrations/meta/",
    () => {
      const schemaChanged = trySchemaChangedVsMain();
      if (schemaChanged === null || schemaChanged === false) {
        // Nada a checar: sem mudança em schema.ts, nenhum snapshot é exigido.
        expect(true).toBe(true);
        return;
      }

      const mainMetaFiles = tryListMainMetaFiles();
      expect(
        mainMetaFiles,
        "origin/main disponível para o journal mas não para listar meta/ — inconsistente",
      ).not.toBeNull();

      const localMetaFiles = readdirSync(META_DIR).filter((f) =>
        f.endsWith("_snapshot.json"),
      );
      const mainSnapshotSet = new Set(
        mainMetaFiles!.filter((f) => f.endsWith("_snapshot.json")),
      );
      const snapshotsNovos = localMetaFiles.filter(
        (f) => !mainSnapshotSet.has(f),
      );

      expect(
        snapshotsNovos.length,
        "src/db/schema.ts mudou vs. origin/main mas nenhum " +
          "db/migrations/meta/NNNN_snapshot.json novo foi commitado. Rode " +
          "`pnpm db:generate` e commite o .sql + o snapshot juntos — sem isso " +
          "o PRÓXIMO db:generate de outra pessoa regenera DDL duplicado a " +
          "partir do snapshot desatualizado (incidente #305/#306).",
      ).toBeGreaterThan(0);
    },
  );
});
