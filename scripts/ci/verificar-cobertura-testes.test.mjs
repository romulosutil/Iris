import { describe, expect, it } from "vitest";
import {
  parseArgs,
  verificarCobertura,
} from "./verificar-cobertura-testes.mjs";

describe("verificar-cobertura-testes — gate anti-pulo e anti-zero-testes (#341)", () => {
  it("aprova quando todos os arquivos e testes passam sem skips e acima do piso", () => {
    const report = {
      numTotalTests: 100,
      numPassedTests: 100,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: "src/exemplo.test.ts",
          status: "passed",
          assertionResults: [{ status: "passed", title: "deve funcionar" }],
        },
      ],
    };

    const res = verificarCobertura(report, {
      minTests: 50,
      minFiles: 1,
      label: "unit",
    });

    expect(res.ok).toBe(true);
    expect(res.problemas).toHaveLength(0);
  });

  it("reprova se houver zero testes executados", () => {
    const report = {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [],
    };

    const res = verificarCobertura(report, {
      minTests: 10,
      minFiles: 1,
      label: "unit",
    });

    expect(res.ok).toBe(false);
    expect(res.problemas).toContain(
      "ZERO testes executados — configuração de include/project provavelmente errada",
    );
  });

  it("reprova se algum arquivo foi coletado mas executou zero testes (coleção vazia / falso positivo)", () => {
    const report = {
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: "src/ok.test.ts",
          status: "passed",
          assertionResults: [{ status: "passed" }],
        },
        {
          name: "src/vazio.stories.tsx",
          status: "passed",
          assertionResults: [], // 0 testes executados
        },
      ],
    };

    const res = verificarCobertura(report, {
      minTests: 1,
      minFiles: 2,
      label: "storybook",
    });

    expect(res.ok).toBe(false);
    expect(res.arquivosSemTestes).toHaveLength(1);
    expect(res.problemas.some((p) => p.includes("ZERO testes"))).toBe(true);
  });

  it("reprova se houver testes com status pending/skipped", () => {
    const report = {
      numTotalTests: 10,
      numPassedTests: 9,
      numFailedTests: 0,
      numPendingTests: 1,
      testResults: [
        {
          name: "src/exemplo.test.ts",
          status: "passed",
          assertionResults: [{ status: "passed" }],
        },
      ],
    };

    const res = verificarCobertura(report, {
      minTests: 5,
      minFiles: 1,
      label: "unit",
    });

    expect(res.ok).toBe(false);
    expect(
      res.problemas.some((p) =>
        p.includes("ambiente de CI nunca deveria disparar skip"),
      ),
    ).toBe(true);
  });

  it("reprova se a contagem ficar abaixo do piso de testes ou arquivos", () => {
    const report = {
      numTotalTests: 40,
      numPassedTests: 40,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: "src/exemplo.test.ts",
          status: "passed",
          assertionResults: [{ status: "passed" }],
        },
      ],
    };

    const res = verificarCobertura(report, {
      minTests: 50,
      minFiles: 2,
      label: "unit",
    });

    expect(res.ok).toBe(false);
    expect(res.problemas).toHaveLength(2);
    expect(res.problemas[0]).toContain("piso é 50");
    expect(res.problemas[1]).toContain("piso é 2");
  });

  it("parseArgs faz parsing correto de parâmetros de linha de comando", () => {
    const args = parseArgs([
      "relatorio.json",
      "--min-tests=100",
      "--min-files=10",
      "--label=storybook",
    ]);

    expect(args).toEqual({
      reportPath: "relatorio.json",
      minTests: 100,
      minFiles: 10,
      label: "storybook",
    });
  });
});
