import { describe, expect, it } from "vitest";
import { ESLint, Linter } from "eslint";
import path from "node:path";
import {
  ESCOPO_RSC,
  FORA_DO_ESCOPO_RSC,
  HOOKS_DE_CLIENTE,
  pluginRSC,
} from "./regra-use-client-obrigatorio.mjs";

/**
 * Guard da regra `rsc/use-client-obrigatorio` (#583).
 *
 * Três camadas, e cada uma cobre um jeito diferente de a regra morrer calada:
 *
 * 1. **Unidade** — a regra acusa o que deve acusar. Uma regra que para de
 *    casar não vira erro de config, vira silêncio verde.
 * 2. **Fiação** — o `eslint.config.mjs` REAL liga a regra no escopo. Medir uma
 *    cópia do config passaria verde justamente no caso que importa: alguém
 *    editar o config e não a regra.
 * 3. **Piso zero medido** — varre `src/components/ui/**` de verdade e exige
 *    zero achados. É esta camada que fica vermelha na prova de mutação
 *    (remover `"use client"` de um componente já correto).
 */

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const REGRA = "rsc/use-client-obrigatorio";

/** Achados da regra num trecho, isolada do resto do config. */
function achados(codigo: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter
    .verify(
      codigo,
      [
        {
          files: ["**/*.tsx"],
          plugins: { rsc: pluginRSC },
          languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true } },
            ecmaVersion: 2024 as const,
            sourceType: "module" as const,
          },
          rules: { [REGRA]: "error" as const },
        },
      ],
      { filename: "x.tsx" },
    )
    .filter((m) => m.ruleId === REGRA);
}

describe("#583 — regra rsc/use-client-obrigatorio (unidade)", () => {
  it("acusa cada hook de cliente em módulo sem a diretiva", () => {
    for (const hook of HOOKS_DE_CLIENTE) {
      const encontrados = achados(`export function C() { ${hook}(); }`);
      expect(encontrados, hook).toHaveLength(1);
      expect(encontrados[0]?.message).toContain(hook);
      expect(encontrados[0]?.message).toContain("use client");
    }
  });

  it("acusa o hook chamado pelo namespace (`React.useState`)", () => {
    expect(
      achados(
        `import * as React from "react";\nexport function C() { const [a, b] = React.useState(null); return a ?? b; }`,
      ),
    ).toHaveLength(1);
  });

  it("cala quando o módulo declara a diretiva no prólogo", () => {
    expect(
      achados(`"use client";\nexport function C() { useState(); }`),
    ).toEqual([]);
    // Comentário antes da diretiva não a invalida: não é nó do corpo.
    expect(
      achados(`// nota\n"use client";\nexport function C() { useState(); }`),
    ).toEqual([]);
    // Duas diretivas no prólogo, a nossa em segundo.
    expect(
      achados(
        `"use strict";\n"use client";\nexport function C() { useState(); }`,
      ),
    ).toEqual([]);
  });

  it("não aceita a string fora do prólogo — lá ela não liga boundary", () => {
    expect(
      achados(
        `import * as React from "react";\n"use client";\nexport function C() { React.useState(); }`,
      ),
    ).toHaveLength(1);
    expect(
      achados(`export function C() { "use client"; return useState(); }`),
    ).toHaveLength(1);
  });

  it("deixa passar Server Component legítimo e o hook `use()`", () => {
    expect(
      achados(
        `export async function P() { const d = use(promessa); return d; }`,
      ),
    ).toEqual([]);
    expect(
      achados(`export async function P() { return await consultar(); }`),
    ).toEqual([]);
    // `useX` que não é hook de cliente do React não entra na régua.
    expect(achados(`export function f() { return usuarioAtual(); }`)).toEqual(
      [],
    );
  });
});

describe("#583 — fiação no eslint.config.mjs real", () => {
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
  });

  it("liga a regra como erro no código de aplicação", async () => {
    for (const arquivo of [
      "src/components/ui/input.tsx",
      "src/components/ui/protocol-dashboard-charts.tsx",
      "src/components/app/fixture-guard.tsx",
      "src/app/(app)/fixture-guard.tsx",
      "src/hooks/fixture-guard.ts",
      "src/lib/fixture-guard.ts",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA]?.[0], arquivo).toBe(2);
    }
    // Timeout largo: cada resolução carrega o flat config inteiro (inclusive
    // `eslint-config-next`), e seis delas passam bem do default de 5s.
  }, 120_000);

  it("deixa teste e story de fora", async () => {
    for (const arquivo of [
      "src/components/ui/fixture-guard.test.tsx",
      "src/components/ui/fixture-guard.stories.tsx",
    ]) {
      const cfg = await eslint.calculateConfigForFile(path.join(RAIZ, arquivo));
      expect(cfg.rules[REGRA], arquivo).toBeUndefined();
    }
    expect(ESCOPO_RSC.length).toBeGreaterThan(0);
    expect(FORA_DO_ESCOPO_RSC).toContain("**/*.test.{ts,tsx}");
  }, 120_000);
});

describe("#583 — piso zero medido", () => {
  it("nenhum módulo de src/components/ui usa hook de cliente sem a diretiva", async () => {
    const eslint = new ESLint({
      cwd: RAIZ,
      overrideConfigFile: path.join(RAIZ, "eslint.config.mjs"),
    });
    const resultados = await eslint.lintFiles(["src/components/ui/**/*.tsx"]);
    const problemas = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === REGRA)
        .map(
          (m) =>
            `${path.relative(RAIZ, r.filePath).replace(/\\/g, "/")}:${m.line} ${m.message}`,
        ),
    );
    expect(resultados.length).toBeGreaterThan(20);
    expect(problemas).toEqual([]);
  }, 120_000);
});
