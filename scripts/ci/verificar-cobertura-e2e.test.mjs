import { describe, expect, it } from "vitest";
import {
  ErroDeUso,
  parseArgs,
  verificarCoberturaE2E,
} from "./verificar-cobertura-e2e.mjs";

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
    expect(() => parseArgs(["rel.json", "--min-tests=17"])).toThrow(ErroDeUso);
    expect(() => parseArgs(["rel.json"])).toThrow(ErroDeUso);
    expect(() => parseArgs([])).toThrow(ErroDeUso);
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
      parseArgs(["e2e-report.json", "--min-tests=17", "--min-files=10"]),
    ).toEqual({ reportPath: "e2e-report.json", minTests: 17, minFiles: 10 });
  });
});
