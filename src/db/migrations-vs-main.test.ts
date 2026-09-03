/**
 * Guards de migração contra `origin/main` (task CI — fecha o buraco que
 * `migrations.test.ts` deixa aberto).
 *
 * `migrations.test.ts` só valida consistência DENTRO do journal local: `when`
 * crescente entre si, sem duplicata, tag casando com `.sql` em disco. Isso
 * passa verde numa base limpa mesmo quando o PR reusa um `when` que já foi
 * MERGEADO em `main` por outro PR — porque naquela base isolada tudo aplica
 * na ordem do próprio journal. O bug só aparece contra uma base que já tem as
 * migrações de `main` (ou seja: produção). O que mergear por último aplica sem
 * erro (Drizzle não reclama de `when` "só um pouco" fora de ordem se ainda for
 * maior que o anterior NO JOURNAL DELE), mas reintroduz o padrão que gerou a
 * #165: um `when` baixo demais fica silenciosamente pulável pelo próximo
 * hand-migration mal calculado.
 *
 * Guard 1 (abaixo) compara cada entrada NOVA do journal local contra o maior
 * `when` já presente em `origin/main` — não só contra o vizinho anterior no
 * próprio array.
 *
 * Guard 2 cobre o outro lado: o `db/migrations/meta/NNNN_snapshot.json` que
 * devia acompanhar a mudança em `src/db/schema.ts` ficando de fora do diff.
 * Sem o snapshot, o PRÓXIMO `pnpm db:generate` (de outra pessoa, meses depois)
 * recalcula o diff a partir do snapshot ANTIGO e regenera DDL duplicado — e o
 * estágio `migrate` do Dockerfile aborta o deploy tentando recriar algo que já
 * existe.
 *
 * O QUE ESTAS DUAS GUARDS NÃO PEGAM (medido em 15/08/2026 contra os PRs #323 e
 * #306, ambos abertos):
 *
 *   - COLISÃO DE NÚMERO/`idx` com `main`. Guard 1 casa por TAG. `origin/main`
 *     está em `0096_patient_clinical_modality` (idx 96, when 1786625656975);
 *     #323 e #306 carregam `0096_billing_cycle_devido` (idx 96, when
 *     1786731685223) — tag diferente, `when` MAIOR que o de `main`, logo Guard
 *     1 passa verde nos dois. Depois do merge sobram dois `0096_*.sql` e dois
 *     `idx: 96` no journal.
 *   - COLISÃO ENTRE DOIS PRs ABERTOS. #323 e #306 escrevem cada um o seu
 *     `0098_*` e nenhum dos dois enxerga o outro: a comparação é sempre contra
 *     `main`. Só o segundo a mergear quebra, e aí `migrations.test.ts` (que
 *     valida `idx` sequencial) é quem reprova — depois do merge, não antes.
 *   - SNAPSHOT COM NOME JÁ EXISTENTE. Guard 2 compara NOMES de arquivo: um
 *     `0096_snapshot.json` reescrito com conteúdo diferente do de `main` conta
 *     como "já existia" e não pontua.
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
    const raw = git([
      "ls-tree",
      "--name-only",
      `${MAIN_REF}:db/migrations/meta`,
    ]);
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * `schema.ts` mudou vs. `origin/main` de um jeito que EXIGE snapshot novo?
 *
 * O que gera drift de snapshot é DDL modelada (tabela, coluna, enum, índice,
 * FK, constraint) — nunca comentário. Um diff só de comentário/linha em branco
 * responde `No schema changes, nothing to migrate` no `pnpm db:generate`
 * (medido em 03/09/2026, #558), logo não há `.sql` nem snapshot para commitar
 * e exigir um travaria a PR pedindo um artefato que não existe.
 *
 * Por isso o guard não olha o NOME do arquivo, e sim as LINHAS do diff: ignora
 * comentário de linha, abertura/corpo/fecho de comentário de bloco e linha
 * vazia, e só acusa se sobrar linha de código. Continua fail-closed no que
 * importa — qualquer DDL sobrevive ao filtro.
 */
export function linhasDeCodigoNoDiff(diff: string): string[] {
  return (
    diff
      .split("\n")
      // só as linhas adicionadas/removidas do CONTEÚDO — o cabeçalho
      // `+++`/`---` e as âncoras `@@` não são conteúdo
      .filter(
        (l) =>
          (l.startsWith("+") || l.startsWith("-")) &&
          !l.startsWith("+++") &&
          !l.startsWith("---"),
      )
      .map((l) => l.slice(1).trim())
      .filter((l) => l.length > 0)
      .filter(
        (l) =>
          !l.startsWith("//") &&
          !l.startsWith("/*") &&
          !l.startsWith("*") &&
          l !== "*/",
      )
  );
}

function trySchemaChangedVsMain(): boolean | null {
  try {
    const raw = git(["diff", "-U0", MAIN_REF, "--", "src/db/schema.ts"]);
    return linhasDeCodigoNoDiff(raw).length > 0;
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

// ─── #558 — o filtro do Guard 2, medido diretamente ──────────────────────────
// O guard passou a olhar linhas em vez do nome do arquivo. O risco de um filtro
// é ficar largo demais e engolir DDL de verdade; estes casos travam os dois
// lados: comentário NÃO exige snapshot, código exige.
describe("linhasDeCodigoNoDiff (#558)", () => {
  const cabecalho = ["--- a/src/db/schema.ts", "+++ b/src/db/schema.ts", "@@"];
  const diff = (linhas: string[]) => [...cabecalho, ...linhas].join("\n");

  it("diff só de comentário não conta como mudança de schema", () => {
    expect(
      linhasDeCodigoNoDiff(
        diff([
          "+    // posição do alvo (base 0); discriminador de idempotência",
          "+    /**",
          "+     * semântica dupla desde a #558",
          "+     */",
          "+",
          "-    // comentário antigo",
        ]),
      ),
    ).toEqual([]);
  });

  it("DDL sobrevive ao filtro — coluna nova continua exigindo snapshot", () => {
    expect(
      linhasDeCodigoNoDiff(
        diff([
          "+    // nova coluna",
          '+    ordemEtapa: integer("ordem_etapa").notNull(),',
        ]),
      ),
    ).toEqual(['ordemEtapa: integer("ordem_etapa").notNull(),']);
  });

  it("cabeçalho e âncora do próprio diff nunca contam como código", () => {
    expect(linhasDeCodigoNoDiff(diff([]))).toEqual([]);
  });
});
