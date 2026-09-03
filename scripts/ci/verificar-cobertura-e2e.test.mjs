import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ErroDeUso,
  coletarFlaky,
  formatarFlaky,
  parseArgs,
  verificarCoberturaE2E,
} from "./verificar-cobertura-e2e.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ARQUIVO_BASELINE_FLAKY = path.join(
  RAIZ,
  "scripts",
  "ci",
  "e2e-flaky.baseline.json",
);

/**
 * Espelha `verificar-cobertura-testes.test.mjs`: o gate é a única coisa que
 * separa "suíte e2e rodou" de "playwright coletou zero spec e saiu 0" (#424).
 * Um gate sem teste é exatamente o verde falso que ele existe pra impedir.
 */

function relatorio({
  expected = 17,
  skipped = 0,
  unexpected = 0,
  flaky = 0,
  arquivos = 10,
} = {}) {
  return {
    stats: { expected, skipped, unexpected, flaky },
    suites: Array.from({ length: arquivos }, (_, i) => ({
      file: `e2e/spec-${i}.spec.ts`,
    })),
  };
}

/**
 * Monta um relatório com a forma real do reporter JSON do Playwright:
 * suites de arquivo -> (opcional) suites de describe aninhadas -> specs ->
 * tests (um por projeto), cada um com `status`. `flakySpecs` descreve os
 * testes que devem sair com `status: "flaky"`.
 */
function relatorioComSuites({
  expected = 0,
  skipped = 0,
  unexpected = 0,
  flaky = 0,
  flakySpecs = [],
} = {}) {
  const porArquivo = new Map();
  for (const espec of flakySpecs) {
    const arquivo = espec.arquivo;
    if (!porArquivo.has(arquivo)) porArquivo.set(arquivo, []);
    porArquivo.get(arquivo).push(espec);
  }
  const suites = Array.from(porArquivo.entries()).map(
    ([arquivo, specsDoArquivo]) => ({
      title: arquivo,
      file: arquivo,
      specs: specsDoArquivo.map((espec) => ({
        title: espec.titulo ?? "um teste flaky",
        line: espec.linha ?? 1,
        tests: [
          {
            projectName: espec.projeto ?? "mobile-360",
            status: "flaky",
          },
        ],
      })),
    }),
  );
  return {
    stats: { expected, skipped, unexpected, flaky },
    suites,
  };
}

describe("verificar-cobertura-e2e — gate anti-pulo-silencioso (#424)", () => {
  it("aprova o piso medido: 10 arquivos, 17 testes, 0 pulado, 0 inesperado", () => {
    const res = verificarCoberturaE2E(relatorio(), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(true);
    expect(res.problemas).toHaveLength(0);
    expect(res.stats).toMatchObject({ arquivos: 10, expected: 17 });
  });

  it("reprova com zero testes executados (testMatch/projects errado)", () => {
    const res = verificarCoberturaE2E(relatorio({ expected: 0, arquivos: 0 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/ZERO testes/);
  });

  it("reprova quando a contagem de testes cai abaixo do piso", () => {
    const res = verificarCoberturaE2E(relatorio({ expected: 16 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/piso é 17/);
  });

  it("conta o teste flaky como executado — retry não é cobertura perdida", () => {
    // Playwright tira o teste que passou no retry de `expected` e o põe em
    // `flaky`: sem somar, 16+1 vira "16 < 17" e o gate acusa o defeito errado.
    const res = verificarCoberturaE2E(relatorio({ expected: 16, flaky: 1 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(true);
    expect(res.problemas).toHaveLength(0);
    expect(res.stats).toMatchObject({ executados: 17, expected: 16, flaky: 1 });
  });

  it("flaky não maquia spec sumido: 15+1 continua abaixo do piso", () => {
    const res = verificarCoberturaE2E(relatorio({ expected: 15, flaky: 1 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/16 teste\(s\) executado\(s\)/);
  });

  it("suíte inteira só flaky ainda conta como executada (sem ZERO testes)", () => {
    const res = verificarCoberturaE2E(relatorio({ expected: 0, flaky: 17 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(true);
    expect(res.problemas.join("\n")).not.toMatch(/ZERO testes/);
  });

  it("reprova quando um arquivo de spec some da coleta, mesmo com testes acima do piso", () => {
    const res = verificarCoberturaE2E(
      relatorio({ expected: 20, arquivos: 9 }),
      { minTests: 17, minFiles: 10 },
    );
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/9 arquivo\(s\)/);
  });

  it("reprova qualquer teste pulado", () => {
    const res = verificarCoberturaE2E(relatorio({ skipped: 1 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/pulado/);
  });

  it("reprova teste com resultado inesperado (falha/timeout)", () => {
    const res = verificarCoberturaE2E(relatorio({ unexpected: 1 }), {
      minTests: 17,
      minFiles: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(/inesperado/);
  });

  it("relatório vazio/truncado não passa por omissão de campos", () => {
    const res = verificarCoberturaE2E({}, { minTests: 17, minFiles: 10 });
    expect(res.ok).toBe(false);
    expect(res.stats).toMatchObject({ arquivos: 0, expected: 0 });
  });

  it("parseArgs exige os dois pisos — piso ausente desligaria o gate", () => {
    expect(() =>
      parseArgs(["rel.json", "--min-tests=17", "--flaky-baseline=b.json"]),
    ).toThrow(ErroDeUso);
    expect(() => parseArgs(["rel.json"])).toThrow(ErroDeUso);
    expect(() => parseArgs([])).toThrow(ErroDeUso);
  });

  it("parseArgs exige --flaky-baseline — ausente ou vazio desligaria o gate de flake", () => {
    expect(() =>
      parseArgs(["rel.json", "--min-tests=17", "--min-files=10"]),
    ).toThrow(ErroDeUso);
    expect(() =>
      parseArgs([
        "rel.json",
        "--min-tests=17",
        "--min-files=10",
        "--flaky-baseline=",
      ]),
    ).toThrow(ErroDeUso);
  });

  it("parseArgs rejeita piso não-inteiro, vazio ou negativo", () => {
    for (const arg of [
      "--min-tests=",
      "--min-tests=abc",
      "--min-tests=-1",
      "--min-tests=1.5",
    ]) {
      expect(() => parseArgs(["rel.json", arg, "--min-files=1"])).toThrow(
        ErroDeUso,
      );
    }
  });

  it("parseArgs rejeita flag desconhecida em vez de ignorar em silêncio", () => {
    expect(() =>
      parseArgs(["rel.json", "--min-tests=17", "--min-files=10", "--turbo=1"]),
    ).toThrow(ErroDeUso);
    expect(() =>
      parseArgs(["rel.json", "--min-tests=17", "--min-files=10", "-x"]),
    ).toThrow(ErroDeUso);
  });

  it("parseArgs devolve os pisos quando o uso está correto", () => {
    expect(
      parseArgs([
        "e2e-report.json",
        "--min-tests=17",
        "--min-files=10",
        "--flaky-baseline=scripts/ci/e2e-flaky.baseline.json",
      ]),
    ).toEqual({
      reportPath: "e2e-report.json",
      minTests: 17,
      minFiles: 10,
      flakyBaselinePath: "scripts/ci/e2e-flaky.baseline.json",
    });
  });
});

/**
 * Q-06 (#542): flaky nunca reprova o gate hoje — a PR anterior (#581) mitigou
 * `represcricao-mv4.spec.ts` com `test.slow()`, mas se ele voltar a oscilar
 * (ou qualquer outro spec ficar flaky pela primeira vez), o gate atual segue
 * verde em silêncio. Estes testes cobrem o baseline por arquivo que fecha
 * esse buraco.
 */
describe("verificar-cobertura-e2e — teto de flaky por arquivo (#542, Q-06)", () => {
  const baselineTresConhecidos = {
    "e2e/mobile-navegacao.spec.ts": 1,
    "e2e/mobile-toque.spec.ts": 1,
    "e2e/mobile-app.spec.ts": 1,
  };

  it("flaky DENTRO do baseline passa (arquivo conhecido, contagem igual ao teto)", () => {
    const res = verificarCoberturaE2E(
      relatorioComSuites({
        expected: 58,
        flaky: 1,
        flakySpecs: [
          {
            arquivo: "e2e/mobile-navegacao.spec.ts",
            titulo: "a barra de lote da validação não fica sob a BottomNav",
            linha: 116,
            projeto: "mobile-360",
          },
        ],
      }),
      { minTests: 17, minFiles: 1, baselineFlaky: baselineTresConhecidos },
    );
    expect(res.ok).toBe(true);
    expect(res.problemas).toHaveLength(0);
  });

  it("flaky ABAIXO do baseline também passa — flake é estocástico, não força zerar o teto", () => {
    const res = verificarCoberturaE2E(relatorioComSuites({ expected: 59 }), {
      minTests: 17,
      minFiles: 0,
      baselineFlaky: baselineTresConhecidos,
    });
    expect(res.ok).toBe(true);
    expect(res.problemas).toHaveLength(0);
  });

  it("flaky ACIMA do baseline reprova — flake novo ou piorado (falha contra o código atual sem o gate)", () => {
    const res = verificarCoberturaE2E(
      relatorioComSuites({
        expected: 57,
        flaky: 2,
        flakySpecs: [
          {
            arquivo: "e2e/mobile-navegacao.spec.ts",
            titulo: "a barra de lote da validação não fica sob a BottomNav",
            linha: 116,
            projeto: "mobile-360",
          },
          {
            arquivo: "e2e/mobile-navegacao.spec.ts",
            titulo: "outro teste do mesmo arquivo que também oscilou",
            linha: 200,
            projeto: "mobile-360",
          },
        ],
      }),
      { minTests: 17, minFiles: 1, baselineFlaky: baselineTresConhecidos },
    );
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(
      /mobile-navegacao\.spec\.ts: 2 teste\(s\) flaky, baseline permite 1/,
    );
  });

  it("qualquer flake em arquivo FORA do baseline reprova na hora — inclusive represcricao-mv4 se voltar a oscilar", () => {
    const res = verificarCoberturaE2E(
      relatorioComSuites({
        expected: 58,
        flaky: 1,
        flakySpecs: [
          {
            arquivo: "e2e/represcricao-mv4.spec.ts",
            titulo: "represcreve MV4 dentro do prazo",
            linha: 40,
            projeto: "desktop",
          },
        ],
      }),
      { minTests: 17, minFiles: 1, baselineFlaky: baselineTresConhecidos },
    );
    expect(res.ok).toBe(false);
    expect(res.problemas.join("\n")).toMatch(
      /represcricao-mv4\.spec\.ts: 1 teste\(s\) flaky, baseline permite 0/,
    );
  });

  it("sem baselineFlaky (opts omitido), QUALQUER flaky reprova — piso implícito é zero", () => {
    const res = verificarCoberturaE2E(
      relatorioComSuites({
        expected: 58,
        flaky: 1,
        flakySpecs: [
          {
            arquivo: "e2e/mobile-app.spec.ts",
            titulo: "sem estouro horizontal em 360px — /relatorios",
            linha: 33,
            projeto: "mobile-360",
          },
        ],
      }),
      { minTests: 17, minFiles: 1 },
    );
    expect(res.ok).toBe(false);
  });

  it("coletarFlaky percorre suites aninhadas (describe blocks) e acha o teste flaky", () => {
    const report = {
      suites: [
        {
          title: "e2e/aninhado.spec.ts",
          file: "e2e/aninhado.spec.ts",
          specs: [],
          suites: [
            {
              title: "descreve algo",
              specs: [
                {
                  title: "um teste dentro do describe",
                  line: 42,
                  tests: [{ projectName: "mobile-360", status: "flaky" }],
                },
                {
                  title: "um teste estável, não deve aparecer",
                  line: 43,
                  tests: [{ projectName: "mobile-360", status: "expected" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const flaky = coletarFlaky(report);
    expect(flaky).toHaveLength(1);
    expect(flaky[0]).toMatchObject({
      arquivo: "e2e/aninhado.spec.ts",
      titulo: "um teste dentro do describe",
      linha: 42,
      projeto: "mobile-360",
    });
    expect(formatarFlaky(flaky[0])).toBe(
      'e2e/aninhado.spec.ts:42 "um teste dentro do describe" [mobile-360]',
    );
  });

  it("relatório sem suites/specs (fixtures antigas) não quebra a coleta de flaky", () => {
    expect(coletarFlaky({})).toEqual([]);
    expect(coletarFlaky({ suites: [{ file: "x.spec.ts" }] })).toEqual([]);
  });
});

describe("verificar-cobertura-e2e — baseline de flaky (scripts/ci/e2e-flaky.baseline.json)", () => {
  it("existe, é JSON válido e só tem os 3 arquivos [mobile-360] conhecidos em 02/09/2026", () => {
    expect(existsSync(ARQUIVO_BASELINE_FLAKY)).toBe(true);
    const baseline = JSON.parse(readFileSync(ARQUIVO_BASELINE_FLAKY, "utf8"));
    expect(Object.keys(baseline).sort()).toEqual(
      [
        "e2e/mobile-navegacao.spec.ts",
        "e2e/mobile-toque.spec.ts",
        "e2e/mobile-app.spec.ts",
      ].sort(),
    );
    for (const [arquivo, teto] of Object.entries(baseline)) {
      expect(
        Number.isInteger(teto) && teto > 0,
        `${arquivo}: teto deve ser inteiro > 0 — zere removendo a entrada`,
      ).toBe(true);
    }
  });
});

describe("verificar-cobertura-e2e — chave do baseline × forma real do relatório (#542)", () => {
  // Regressão do defeito que a PR #585 levou para o CI: o relatório do
  // Playwright emite `suite.file` RELATIVO ao `testDir` (`mobile-toque.spec.ts`)
  // e o baseline é escrito com o caminho do repositório
  // (`e2e/mobile-toque.spec.ts`). Sem normalizar as duas pontas, o lookup erra,
  // cai no `?? 0` e todo flake CONHECIDO reprova — o baseline fica inerte e o
  // gate vira o `--max-flaky=0` duro que ele existe para evitar.
  //
  // A primeira versão passou nos testes porque as fixtures inventaram a forma
  // da chave em vez de copiar a do Playwright. Esta fixture usa a forma real.
  const relatorioFormaReal = {
    stats: { expected: 58, skipped: 0, unexpected: 0, flaky: 1 },
    suites: [
      {
        // sem prefixo `e2e/` — é assim que o Playwright escreve
        file: "mobile-toque.spec.ts",
        specs: [
          {
            title: "alvos de toque ≥ 44px — /validacao",
            line: 56,
            tests: [{ status: "flaky", projectName: "mobile-360" }],
          },
        ],
      },
    ],
  };

  it("baseline com prefixo `e2e/` casa com o arquivo sem prefixo do relatório", () => {
    const r = verificarCoberturaE2E(relatorioFormaReal, {
      baselineFlaky: { "e2e/mobile-toque.spec.ts": 1 },
    });
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("baseline sem prefixo também casa — as duas grafias são aceitas", () => {
    const r = verificarCoberturaE2E(relatorioFormaReal, {
      baselineFlaky: { "mobile-toque.spec.ts": 1 },
    });
    expect(r.ok).toBe(true);
  });

  it("flake acima do teto continua reprovando, com a chave normalizada", () => {
    const r = verificarCoberturaE2E(relatorioFormaReal, {
      baselineFlaky: { "e2e/outro.spec.ts": 5 },
    });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toContain("mobile-toque.spec.ts");
  });
});
