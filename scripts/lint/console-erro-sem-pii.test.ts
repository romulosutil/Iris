import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";

/**
 * Guard da regra `no-restricted-syntax` de #531 (S-03).
 *
 * Por que existe (NIT da revisão da PR #546): os dois seletores casam uma
 * FORMA de AST (`Identifier` no campo `arguments` de um `CallExpression`,
 * `Property` dentro de um `ObjectExpression`). Nada nesse acoplamento é
 * verificado pelo ESLint — um seletor que deixa de casar não vira erro de
 * configuração, vira silêncio: `pnpm lint` continua verde e os
 * `console.error(rotulo, err)` voltam a entrar no repositório sem que ninguém
 * perceba. Se o parser do `typescript-eslint` mudar como representa esses nós,
 * é este teste que fica vermelho.
 *
 * Mede o config REAL (`eslint.config.mjs`), não uma cópia do seletor: uma
 * cópia passaria verde justamente no caso que importa, o de alguém editar o
 * config e não a regra.
 */

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const REGRA = "no-restricted-syntax";

const eslint = new ESLint({
  cwd: RAIZ,
  overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
});

/** Achados da regra num trecho, como se fosse o arquivo `caminho`. */
async function achados(
  codigo: string,
  caminho = "src/lib/fixture-guard-console.ts",
): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, {
    filePath: path.join(RAIZ, caminho),
    warnIgnored: false,
  });
  return (resultado?.messages ?? [])
    .filter((m) => m.ruleId === REGRA)
    .map((m) => m.message);
}

describe("#531 — lint contra `console.error(rotulo, err)` (S-03)", () => {
  /**
   * #597 — a instância do ESLint já é única (acima), mas a PRIMEIRA
   * `lintText` é que paga o carregamento do flat config inteiro:
   * `eslint-config-next`, o `typescript-eslint` e o plugin do Storybook.
   * Medido nesta máquina: 16.7s na primeira chamada, 20-37ms em cada uma das
   * seguintes. Esse custo caía sobre o primeiro `it` do arquivo, que estourava
   * o `testTimeout` padrão de 5s — vermelho crônico local, verde no CI só
   * porque o runner é mais rápido.
   *
   * Pagar o aquecimento aqui, com timeout de hook explícito, mantém cada teste
   * no orçamento apertado de 5s: se um caso passar a demorar de verdade, o
   * padrão continua acusando em vez de ficar escondido atrás de um
   * `testTimeout` inflado para o arquivo todo.
   */
  beforeAll(async () => {
    await achados("export const aquecimento = 1;");
  }, 120_000);

  it("acusa o erro como argumento direto do console.error", async () => {
    for (const identificador of [
      "err",
      "e",
      "error",
      "erro",
      "dbErr",
      "exception",
    ]) {
      const achado = await achados(
        `export function f(${identificador}: unknown) { console.error("acao:", ${identificador}); }`,
      );
      expect(achado, identificador).toHaveLength(1);
      expect(achado[0]).toContain("logarErroSemPII");
    }
  });

  it("acusa o console.error com o erro sozinho, sem rótulo", async () => {
    expect(
      await achados("export function f(e: unknown) { console.error(e); }"),
    ).toHaveLength(1);
  });

  it("acusa o erro embutido num objeto literal", async () => {
    const achado = await achados(
      'export function f(err: unknown) { console.error("acao:", { id: 1, err }); }',
    );
    expect(achado).toHaveLength(1);
    expect(achado[0]).toContain("logarErroSemPII");
  });

  it("deixa passar o console.error sem erro e a chamada ao helper", async () => {
    expect(
      await achados(
        'export function f() { console.error("acao:", { id: 1 }); }',
      ),
    ).toEqual([]);
    expect(
      await achados(
        'import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";\nexport function f(err: unknown) { logarErroSemPII("acao:", err); }',
      ),
    ).toEqual([]);
  });

  it("vale nos dois escopos e fica fora de teste e story", async () => {
    const codigo =
      'export function f(err: unknown) { console.error("a:", err); }';
    expect(await achados(codigo, "src/app/fixture-guard.ts")).toHaveLength(1);
    expect(await achados(codigo, "src/lib/fixture-guard.ts")).toHaveLength(1);
    // Lá o "erro" é dublê: um `new Error("boom")` de fixture não tem PII.
    expect(await achados(codigo, "src/lib/fixture-guard.test.ts")).toEqual([]);
    expect(await achados(codigo, "src/lib/fixture-guard.stories.ts")).toEqual(
      [],
    );
  });
});
