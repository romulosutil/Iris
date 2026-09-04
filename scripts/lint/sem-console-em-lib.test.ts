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
 * 2. **Fiação** — o `eslint.config.mjs` REAL liga a regra em `src/lib/**` e
 *    (desde a F3) em `src/app/api/**`. Medir uma cópia do config passaria
 *    verde justamente no caso que importa: alguém editar o config e não a
 *    regra. Esta camada também prova que o bloco novo NÃO apagou o guard de
 *    PHI do `console.error` (#531) — nem nos arquivos de lib, nem nas rotas
 *    de API, onde aquele guard também casa. É a armadilha de flat config que
 *    motivou a regra própria em vez de um segundo `no-restricted-syntax`.
 * 3. **Piso zero medido** — varre `src/lib/**` e `src/app/api/**` de verdade e
 *    exige zero achados em cada um. É esta camada que fica vermelha na prova
 *    de mutação (reintroduzir um `console.warn` cru num módulo de lib ou numa
 *    rota interna).
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

describe("#560/F3 — fiação em src/app/api (rotas de API e jobs internos)", () => {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });

  it("liga a regra como erro nas rotas internas de job e nos webhooks", async () => {
    for (const arquivo of [
      "src/app/api/internal/jobs/asr-transcrever/route.ts",
      "src/app/api/internal/jobs/exportacao-integral/route.ts",
      "src/app/api/internal/billing/fechar-ciclos/route.ts",
      "src/app/api/internal/billing/conciliar/route.ts",
      "src/app/api/hooks/asaas/route.ts",
      "src/app/api/hooks/resend/route.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
    expect(ESCOPO_SEM_CONSOLE).toContain("src/app/api/**/*.{ts,tsx}");
  }, 120_000);

  it("NÃO apagou o guard de PHI do console.error (#531) nas rotas de API", async () => {
    // Mesma armadilha da camada de lib, medida do outro lado da fronteira: o
    // `files` da #531 cobre `src/app/**`, então é EXATAMENTE aqui que um
    // bloco novo com `no-restricted-syntax` teria apagado aquele guard em
    // silêncio. Ligar o escopo desta regra em `src/app/api/**` não pode ter
    // custado o guard vizinho.
    const cfg = await eslint.calculateConfigForFile(
      path.join(RAIZ, "src/app/api/internal/jobs/asr-transcrever/route.ts"),
    );
    expect(cfg.rules[REGRA_PHI]?.[0]).toBe(2);
    expect(JSON.stringify(cfg.rules[REGRA_PHI]?.slice(1) ?? [])).toContain(
      "logarErroSemPII",
    );
  }, 120_000);

  it("deixa os `logic.ts` de rota de fora — eles são a F4", async () => {
    // Fronteira da fatia, não descuido: os 11 `logic.ts` ainda têm `console.*`
    // e são os arquivos que a #559 move. Ligar o escopo neles agora
    // produziria um baseline, que é o que este plano decidiu não ter. Se
    // alguém alargar `ESCOPO_SEM_CONSOLE` para `src/app/**` sem migrar, este
    // teste fica vermelho antes do lint inteiro ficar.
    for (const arquivo of [
      "src/app/(auth)/cadastro/logic.ts",
      "src/app/(app)/diario/[sessionId]/logic.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA], arquivo).toBeUndefined();
    }
  }, 120_000);
});

/** Sítios acusados pela regra ao varrer `padrao`, como `arquivo:linha`. */
async function varrer(padrao: string): Promise<{
  problemas: string[];
  arquivos: number;
}> {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });
  const resultados = await eslint.lintFiles([padrao]);
  return {
    arquivos: resultados.length,
    problemas: resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === REGRA)
        .map(
          (m) =>
            `${path.relative(RAIZ, r.filePath).replace(/\\/g, "/")}:${m.line}`,
        ),
    ),
  };
}

describe("#560 — piso zero medido", () => {
  it("nenhum console cru em src/lib (F2)", async () => {
    const { problemas, arquivos } = await varrer("src/lib/**/*.{ts,tsx}");
    // Sanidade: se a varredura não achasse arquivo nenhum, o `[]` acima seria
    // verde por vacuidade — o defeito [teste-verde-que-nao-testa-nada].
    expect(arquivos).toBeGreaterThan(50);
    expect(problemas).toEqual([]);
  }, 180_000);

  it("nenhum console cru em src/app/api (F3)", async () => {
    const { problemas, arquivos } = await varrer("src/app/api/**/*.{ts,tsx}");
    // Piso de sanidade menor que o de lib porque a superfície é menor: 11
    // arquivos de produção hoje. O que ele guarda é o mesmo — um glob que
    // pare de casar não pode passar por "zero achados".
    expect(arquivos).toBeGreaterThan(5);
    expect(problemas).toEqual([]);
  }, 180_000);
});
