import { describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import path from "node:path";
import {
  ARQUIVOS_QUE_SAO_O_SINK,
  ESCOPO_SEM_CONSOLE,
  ESCOPO_SEM_CONSOLE_JOBS,
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
 * 2. **Fiação** — o `eslint.config.mjs` REAL liga a regra em `src/lib/**`,
 *    em `src/app/**` e em `src/auth/**`. Medir uma cópia do config passaria
 *    verde justamente no caso que importa: alguém editar o config e não a
 *    regra. Esta camada também prova que o bloco novo NÃO apagou o guard de
 *    PHI do `console.error` (#531) — nem nos arquivos de lib, nem nas rotas
 *    de API, onde aquele guard também casa. É a armadilha de flat config que
 *    motivou a regra própria em vez de um segundo `no-restricted-syntax`.
 * 3. **Piso zero medido** — varre `src/lib/**`, `src/app/**` e `src/auth/**`
 *    de verdade e exige zero achados em cada um. É esta camada que fica
 *    vermelha na prova de mutação (reintroduzir um `console.warn` cru num
 *    módulo de lib, numa rota interna ou num `logic.ts`).
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
    // O glob que cobre estes arquivos deixou de ser `src/app/api/**` na F4 e
    // passou a ser a árvore de rota inteira. O que a fatia F3 comprou não é o
    // glob literal — é a regra ligada NESTES arquivos, que as asserções acima
    // medem uma a uma pelo config real.
    expect(ESCOPO_SEM_CONSOLE).toContain("src/app/**/*.{ts,tsx}");
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
});

describe("#560/F4 — fiação nos `logic.ts` de rota e em src/auth", () => {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });

  it("liga a regra como erro nos `logic.ts` que a F4 migrou", async () => {
    // Até a F3 estes arquivos estavam FORA do escopo de propósito (tinham 8
    // `console.*` vivos, e ligar a regra antes de migrar produziria um
    // baseline). A F4 migrou os 8 e alargou o glob de `src/app/api/**` para
    // `src/app/**`; esta asserção é o que impede o glob de encolher de volta
    // num merge sem ninguém perceber.
    for (const arquivo of [
      "src/app/(auth)/cadastro/logic.ts",
      "src/app/(auth)/esqueci-senha/logic.ts",
      "src/app/(auth)/redefinir-senha/logic.ts",
      "src/app/(app)/revisao/[sessionId]/logic.ts",
      // `diario/[sessionId]/logic.ts` não está aqui porque não existe mais:
      // a #559 (F4) o promoveu a `src/lib/sessao/diario-*`, coberto pelo glob
      // de `src/lib/**`. A `actions.ts` que ficou na rota segue coberta.
      //
      // Não só `logic.ts`: o glob cobre a árvore de rota inteira, senão o
      // próximo `console` nasce numa `page.tsx` `async` ou numa `actions.ts`,
      // que rodam no mesmo servidor e escrevem no mesmo stdout.
      "src/app/(app)/pacientes/[id]/page.tsx",
      "src/app/(app)/diario/[sessionId]/actions.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
    expect(ESCOPO_SEM_CONSOLE).toContain("src/app/**/*.{ts,tsx}");
  }, 120_000);

  it("liga a regra como erro em src/auth", async () => {
    // `auth.ts` tinha o sítio de pior classe da varredura inteira:
    // `console.error("dispararEmail: …", err)` com o ERRO CRU — a `message`
    // do provedor de e-mail embute o destinatário, a do driver é o SQL com os
    // params. Um escopo que parasse na fronteira de `src/app` deixaria de
    // fora justamente o arquivo que a issue existe para consertar.
    for (const arquivo of ["src/auth/auth.ts", "src/auth/require-role.ts"]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
    expect(ESCOPO_SEM_CONSOLE).toContain("src/auth/**/*.{ts,tsx}");
  }, 120_000);

  it("NÃO apagou o guard de PHI do console.error (#531) nos `logic.ts`", async () => {
    // Terceira medição da mesma armadilha de flat config, agora na população
    // que a #531 mais cobre: os `logic.ts` de rota. Alargar o `files` desta
    // regra não pode ter custado o guard vizinho.
    const cfg = await eslint.calculateConfigForFile(
      path.join(RAIZ, "src/app/(app)/revisao/[sessionId]/logic.ts"),
    );
    expect(cfg.rules[REGRA_PHI]?.[0]).toBe(2);
    expect(JSON.stringify(cfg.rules[REGRA_PHI]?.slice(1) ?? [])).toContain(
      "logarErroSemPII",
    );
  }, 120_000);

  it("os componentes `use client` de src/components seguem fora", async () => {
    // Decisão, não descuido: ali o `console` é o canal do BROWSER — não há
    // stdout de container para ler nem `requestId` de servidor a
    // correlacionar. Se um dia entrarem, é por decisão própria.
    for (const arquivo of [
      "src/components/ui/button.tsx",
      "src/components/pwa/registrar-sw.tsx",
      "src/components/clarity.tsx",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA], arquivo).toBeUndefined();
    }
  }, 120_000);
});

/** Sítios acusados pela regra ao varrer `padroes`, como `arquivo:linha`. */
async function varrer(...padroes: string[]): Promise<{
  problemas: string[];
  arquivos: number;
}> {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });
  const resultados = await eslint.lintFiles(padroes);
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

describe("#560/F3b — fiação nos scripts .mjs de job de infra", () => {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });

  it("liga a regra como erro em cada script copiado para imagem de infra", async () => {
    for (const arquivo of ESCOPO_SEM_CONSOLE_JOBS) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
  }, 180_000);

  it("deixa a CLI de desenvolvimento de fora — lá o console é a interface", async () => {
    // `guardrail-conexao.mjs` imprime um aviso com `⚠️` no terminal de quem vai
    // rodar seed contra banco remoto. Ele entra na imagem do escalonamento só
    // porque aquele Dockerfile copia `scripts/lib/` inteiro; o job não o
    // executa. Virar JSON numa linha pioraria a única coisa que ele faz.
    for (const arquivo of [
      "scripts/lib/guardrail-conexao.mjs",
      "scripts/seed-local.ts",
      "scripts/ci/verificar-deps-imagem.mjs",
      "scripts/lint/gerar-baseline-ds.mjs",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA], arquivo).toBeUndefined();
    }
  }, 180_000);

  it("cada arquivo listado no escopo EXISTE", async () => {
    // Um caminho que some (arquivo renomeado, script aposentado) não vira erro
    // de config: o `files` simplesmente não casa nada, e o guard fica verde por
    // vacuidade sobre um arquivo que talvez tenha voltado a usar `console`.
    const { access } = await import("node:fs/promises");
    for (const arquivo of ESCOPO_SEM_CONSOLE_JOBS) {
      await expect(
        access(path.join(RAIZ, arquivo)),
        arquivo,
      ).resolves.toBeUndefined();
    }
  });
});

describe("#560 — piso zero medido", () => {
  it("nenhum console cru em src/lib (F2)", async () => {
    const { problemas, arquivos } = await varrer("src/lib/**/*.{ts,tsx}");
    // Sanidade: se a varredura não achasse arquivo nenhum, o `[]` acima seria
    // verde por vacuidade — o defeito [teste-verde-que-nao-testa-nada].
    expect(arquivos).toBeGreaterThan(50);
    expect(problemas).toEqual([]);
  }, 180_000);

  it("nenhum console cru nos scripts de job de infra (F3b)", async () => {
    const { problemas, arquivos } = await varrer(...ESCOPO_SEM_CONSOLE_JOBS);
    // Aqui a sanidade é EXATA, não um piso: o escopo é uma lista de arquivos
    // nomeados, então varrer menos do que ela tem significa que um caminho
    // deixou de existir — e um `files` que não casa nada fica verde por
    // vacuidade sobre um arquivo que talvez tenha voltado ao `console`.
    expect(arquivos).toBe(ESCOPO_SEM_CONSOLE_JOBS.length);
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

  it("nenhum console cru em src/app inteiro (F4)", async () => {
    // A varredura que a fatia fechou: 8 sítios em 5 `logic.ts`, todos
    // migrados. É esta camada que fica vermelha na prova de mutação —
    // reintroduzir um `console.warn` cru em qualquer `logic.ts`, `page.tsx` ou
    // `actions.ts` de rota.
    const { problemas, arquivos } = await varrer("src/app/**/*.{ts,tsx}");
    expect(arquivos).toBeGreaterThan(100);
    expect(problemas).toEqual([]);
  }, 300_000);

  it("nenhum console cru em src/auth (F4)", async () => {
    const { problemas, arquivos } = await varrer("src/auth/**/*.{ts,tsx}");
    expect(arquivos).toBeGreaterThan(3);
    expect(problemas).toEqual([]);
  }, 180_000);
});
