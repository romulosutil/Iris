import { describe, expect, it } from "vitest";
import {
  ErroDeUso,
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

  it("reprova arquivo que falhou na coleta (status != passed com ZERO asserções)", () => {
    // Caso real do #341: o arquivo de story explode ao resolver o módulo, então
    // não chega a registrar teste nenhum — `numFailedTests` fica 0 e só o
    // status do arquivo denuncia. Sem este ramo o relatório sairia verde.
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
          name: "src/quebrou.stories.tsx",
          status: "failed",
          message: "Cannot find module 'next\\dist\\compiled\\react'",
          assertionResults: [],
        },
      ],
    };

    const res = verificarCobertura(report, {
      minTests: 1,
      minFiles: 2,
      label: "storybook",
    });

    expect(res.ok).toBe(false);
    expect(res.arquivosNaoOk).toHaveLength(1);
    expect(res.arquivosSemTestes).toHaveLength(1);
    expect(res.problemas.some((p) => p.includes("falharam em 1 arquivo"))).toBe(
      true,
    );
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

  it("parseArgs usa o caminho do relatório como label padrão", () => {
    const args = parseArgs([
      "relatorio.json",
      "--min-tests=1",
      "--min-files=1",
    ]);
    expect(args.label).toBe("relatorio.json");
  });

  it("parseArgs recusa piso não numérico (senão `total < NaN` desliga o gate em silêncio)", () => {
    expect(() =>
      parseArgs(["relatorio.json", "--min-tests=mil", "--min-files=10"]),
    ).toThrow(ErroDeUso);
    expect(() =>
      parseArgs(["relatorio.json", "--min-tests=", "--min-files=10"]),
    ).toThrow(ErroDeUso);
    expect(() =>
      parseArgs(["relatorio.json", "--min-tests=-1", "--min-files=10"]),
    ).toThrow(ErroDeUso);
  });

  it("parseArgs recusa flag com typo em vez de cair no piso default", () => {
    expect(() =>
      parseArgs(["relatorio.json", "--min-test=1300", "--min-files=180"]),
    ).toThrow(/--min-test\b/);
    expect(() =>
      parseArgs(["relatorio.json", "-min-tests=1300", "--min-files=180"]),
    ).toThrow(ErroDeUso);
  });

  it("parseArgs exige os dois pisos e o caminho do relatório", () => {
    expect(() => parseArgs(["relatorio.json", "--min-files=10"])).toThrow(
      /obrigatórios/,
    );
    expect(() => parseArgs(["relatorio.json", "--min-tests=10"])).toThrow(
      /obrigatórios/,
    );
    expect(() => parseArgs([])).toThrow(ErroDeUso);
  });
});
