import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste de fiação do guardrail (D52).
 *
 * O módulo `guardrail-seed.ts` é coberto em isolamento por `guardrail-seed.test.ts`,
 * mas nada provava que os scripts de seed de fato o CHAMAM — remover a linha
 * `assertSeedAllowed(...)` de um script passava a suíte inteira em verde.
 *
 * Aqui a asserção é estática sobre o código-fonte: cada script de seed precisa
 * importar o guardrail e invocá-lo ANTES de abrir qualquer conexão Postgres.
 */

const RAIZ_SCRIPTS = join(__dirname, "..");

/** Scripts de seed que executam TRUNCATE / DELETE ou gravam senhas padrão. */
const SCRIPTS_DE_SEED = [
  "seed.ts",
  "seed-local.ts",
  "seed-demo-account.ts",
  "seed-super-admin.ts",
] as const;

function lerScript(nome: string): string {
  return readFileSync(join(RAIZ_SCRIPTS, nome), "utf8");
}

describe("guardrail-seed — fiação nos scripts de seed (D52)", () => {
  it.each(SCRIPTS_DE_SEED)("%s importa o guardrail", (nome) => {
    const fonte = lerScript(nome);
    expect(fonte).toMatch(
      /import\s*\{[^}]*\bassertSeedAllowed\b[^}]*\}\s*from\s*["'](\.\/lib\/guardrail-seed|\.\/guardrail-seed)["']/,
    );
  });

  it.each(SCRIPTS_DE_SEED)("%s invoca assertSeedAllowed", (nome) => {
    const fonte = lerScript(nome);
    expect(fonte).toMatch(/\bassertSeedAllowed\s*\(/);
  });

  it.each(SCRIPTS_DE_SEED)(
    "%s invoca o guardrail antes de abrir conexão ou executar DDL/DML destrutivo",
    (nome) => {
      const fonte = lerScript(nome);

      const posGuard = fonte.search(/\bassertSeedAllowed\s*\(/);
      expect(posGuard).toBeGreaterThanOrEqual(0);

      // Primeiro ponto de contato com o banco: abrir conexão, importar outro
      // seed, ou emitir TRUNCATE/DELETE.
      const efeitos = [
        /\bpostgres\s*\(/, // abre pool
        /await\s+import\s*\(\s*["']\.\/seed/, // delega para outro seed
        /TRUNCATE\s+TABLE/i,
        /DELETE\s+FROM/i,
      ];

      for (const efeito of efeitos) {
        const posEfeito = fonte.search(efeito);
        if (posEfeito === -1) continue;
        expect(
          posGuard,
          `${nome}: assertSeedAllowed() aparece depois de ${efeito} (offset guard=${posGuard}, efeito=${posEfeito})`,
        ).toBeLessThan(posEfeito);
      }
    },
  );

  it("cobre todo script de seed declarado em package.json", () => {
    const pkg = JSON.parse(
      readFileSync(join(RAIZ_SCRIPTS, "..", "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    const alvos = Object.entries(pkg.scripts)
      .filter(([nome]) => nome === "seed" || nome.startsWith("seed:"))
      .flatMap(([, cmd]) => cmd.match(/scripts\/([\w-]+\.ts)/g) ?? [])
      .map((caminho) => caminho.replace("scripts/", ""));

    expect(alvos.length).toBeGreaterThan(0);
    for (const alvo of new Set(alvos)) {
      expect(
        SCRIPTS_DE_SEED as readonly string[],
        `package.json declara um seed apontando para scripts/${alvo}, que não está coberto pelo teste de fiação do guardrail`,
      ).toContain(alvo);
    }
  });
});
