import { describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import path from "node:path";
import {
  ARQUIVOS_QUE_SAO_O_SINK,
  ESCOPO_SEM_CONSOLE,
  FORA_DO_ESCOPO_SEM_CONSOLE,
  metodoDeConsole,
  pluginObservabilidade,
} from "./regra-sem-console-em-lib.mjs";

/**
 * Guard da regra `obs/sem-console-cru` (#560, fatia F2).
 *
 * Espelha a estrutura de `use-client-obrigatorio.test.ts`, e pelo mesmo
 * motivo: três camadas, cada uma cobrindo um jeito diferente de a regra
 * morrer calada.
 *
 * 1. **Unidade** — a regra acusa o que deve acusar. Um seletor que para de
 *    casar não vira erro de config, vira silêncio verde.
 * 2. **Fiação** — o `eslint.config.mjs` REAL liga a regra em `src/lib/**`.
 *    Medir uma cópia do config passaria verde justamente no caso que importa:
 *    alguém editar o config e não a regra. Esta camada também prova que o
 *    bloco novo NÃO apagou o guard de PHI do `console.error` (#531) nos
 *    arquivos de lib — que é a armadilha de flat config que motivou a regra
 *    própria em vez de um segundo `no-restricted-syntax`.
 * 3. **Piso zero medido** — varre `src/lib/**` de verdade e exige zero
 *    achados. É esta camada que fica vermelha na prova de mutação
 *    (reintroduzir um `console.warn` cru num módulo de lib).
 */

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const REGRA = "obs/sem-console-cru";
const REGRA_PHI = "no-restricted-syntax";

/** Achados da regra num trecho, isolada do resto do config. */
function achados(codigo: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter
    .verify(
      codigo,
      [
        {
          files: ["**/*.ts"],
          plugins: { obs: pluginObservabilidade },
          languageOptions: {
            ecmaVersion: 2024 as const,
            sourceType: "module" as const,
          },
          rules: { [REGRA]: "error" as const },
        },
      ],
      { filename: "x.ts" },
    )
    .filter((m) => m.ruleId === REGRA);
}

describe("#560/F2 — regra obs/sem-console-cru (unidade)", () => {
  it("acusa cada método do console", () => {
    for (const metodo of [
      "log",
      "info",
      "warn",
      "error",
      "debug",
      "trace",
      "table",
    ]) {
      const encontrados = achados(`console.${metodo}("x");`);
      expect(encontrados, metodo).toHaveLength(1);
      expect(encontrados[0]?.message).toContain(metodo);
    }
  });

  it("aponta o nível equivalente do logger na mensagem", () => {
    // `console.log` não tem nível próprio: a sugestão precisa ser `info`, e
    // não `log` — `logger.log` não existe e a dica mandaria para um erro de
    // compilação.
    expect(achados(`console.log("x");`)[0]?.message).toContain("logger.info(");
    expect(achados(`console.warn("x");`)[0]?.message).toContain("logger.warn(");
    expect(achados(`console.trace("x");`)[0]?.message).toContain(
      "logger.debug(",
    );
  });

  it("acusa a forma computada — senão o guard ensina a contorná-lo", () => {
    // Um guard que só casa `console.warn` faz o próximo contorno ser
    // `console["warn"]`, indistinguível de código legítimo na revisão.
    expect(achados(`console["warn"]("x");`)).toHaveLength(1);
  });

  it("acusa o console dentro de catch, que é onde ele reaparece", () => {
    expect(
      achados(`try { f(); } catch (e) { console.warn("falhou", { e }); }`),
    ).toHaveLength(1);
  });

  it("não acusa o logger nem um objeto que apenas se chame console", () => {
    expect(achados(`logger.warn("evento.x", { id: 1 });`)).toEqual([]);
    expect(achados(`logarAvisoSemPII("evento.x", err, { clinicId });`)).toEqual(
      [],
    );
    // `meu.console.warn` não é o `console` global: o objeto raiz não casa.
    expect(achados(`meu.console.warn("x");`)).toEqual([]);
    // Propriedade computada por variável não é decidível estaticamente e não
    // é o padrão que a regra existe para pegar.
    expect(achados(`const c = console; c.warn("x");`)).toEqual([]);
  });

  it("`metodoDeConsole` devolve null fora de um acesso a console", () => {
    expect(metodoDeConsole({ type: "Identifier", name: "f" })).toBeNull();
  });
});

describe("#560/F2 — fiação no eslint.config.mjs real", () => {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });

  it("liga a regra como erro em src/lib", async () => {
    for (const arquivo of [
      "src/lib/billing/subscription.ts",
      "src/lib/billing/provider/asaas.ts",
      "src/lib/email/webhook.ts",
      "src/lib/jobs/heartbeat.ts",
      "src/lib/fixture-guard.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
    // Timeout largo: cada resolução carrega o flat config inteiro (inclusive
    // `eslint-config-next`), e isso passa bem do default de 5s.
  }, 120_000);

  it("NÃO apagou o guard de PHI do console.error (#531) nos arquivos de lib", async () => {
    // A armadilha medida: em flat config as opções de uma MESMA regra não se
    // somam entre blocos. Se este guard tivesse sido escrito como um segundo
    // bloco `no-restricted-syntax` para `src/lib/**`, os dois seletores da
    // #531 sumiriam daqui — sem erro nenhum. Esta asserção é o que torna essa
    // regressão visível.
    const cfg = await eslint.calculateConfigForFile(
      path.join(RAIZ, "src/lib/billing/subscription.ts"),
    );
    const opcoes = cfg.rules[REGRA_PHI]?.slice(1) ?? [];
    expect(cfg.rules[REGRA_PHI]?.[0]).toBe(2);
    expect(JSON.stringify(opcoes)).toContain("logarErroSemPII");
  }, 120_000);

  it("deixa teste, story e o próprio sink de fora", async () => {
    for (const arquivo of [
      "src/lib/billing/fixture-guard.test.ts",
      "src/lib/billing/fixture-guard.int.test.ts",
      "src/lib/billing/fixture-guard.stories.tsx",
      ...ARQUIVOS_QUE_SAO_O_SINK,
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA], arquivo).toBeUndefined();
    }
    expect(ESCOPO_SEM_CONSOLE).toContain("src/lib/**/*.{ts,tsx}");
    expect(FORA_DO_ESCOPO_SEM_CONSOLE).toContain("**/*.test.{ts,tsx}");
  }, 120_000);
});

describe("#560/F2 — piso zero medido", () => {
  it("nenhum console cru em src/lib", async () => {
    const eslint = new ESLint({
      cwd: RAIZ,
      overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
    });
    const resultados = await eslint.lintFiles(["src/lib/**/*.{ts,tsx}"]);
    const problemas = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === REGRA)
        .map(
          (m) =>
            `${path.relative(RAIZ, r.filePath).replace(/\\/g, "/")}:${m.line}`,
        ),
    );
    // Sanidade: se a varredura não achasse arquivo nenhum, o `[]` acima seria
    // verde por vacuidade — o defeito [teste-verde-que-nao-testa-nada].
    expect(resultados.length).toBeGreaterThan(50);
    expect(problemas).toEqual([]);
  }, 180_000);
});
