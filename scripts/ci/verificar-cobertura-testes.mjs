/**
 * Segundo gate depois de `vitest run --reporter=json` (#187/#261 + task CI —
 * "Não aceite exit 0 como prova").
 *
 * Por que existe: o exit code do vitest sozinho não prova cobertura. Um
 * comando mal configurado (ex.: rodar `pnpm test` esperando pegar
 * `*.int.test.ts`, que `vitest.config.ts` EXCLUI de propósito) ou um ambiente
 * que deixa a suíte se auto-pular (achado real: 64 de 68 arquivos RLS
 * pulados em silêncio porque `DATABASE_URL` apontava pra role dona) sai
 * VERDE com zero — ou quase zero — teste executado. Este script lê o
 * relatório JSON do próprio vitest e reprova o job se:
 *
 *   1. o total de testes executados ficar abaixo do piso informado;
 *   2. o total de ARQUIVOS de teste executados ficar abaixo do piso;
 *   3. houver qualquer teste "pending"/"skipped" (pulado por ambiente —
 *      `describe.skipIf`/`ALLOW_SKIP_INTEGRATION` nunca deveria disparar em CI);
 *   4. houver qualquer arquivo com status != "passed".
 *
 * Uso:
 *   node scripts/ci/verificar-cobertura-testes.mjs <relatorio.json> \
 *     --min-tests=900 --min-files=100 --label="unit"
 *
 * Os pisos são medidos, não chutados — ver o corpo do PR que introduziu este
 * arquivo para a contagem real no dia em que foi calibrado. Se a suíte
 * crescer, o piso não acompanha sozinho: é aceitável, a intenção é pegar uma
 * QUEDA abrupta, não travar todo crescimento.
 */
import { readFileSync } from "node:fs";

const USO =
  "uso: node verificar-cobertura-testes.mjs <relatorio.json> --min-tests=N --min-files=N [--label=nome]";

/** Erro de linha de comando: o gate não chegou a rodar, então sai 2, não 1. */
export class ErroDeUso extends Error {}

/**
 * Um piso que não chega (flag com typo, valor não numérico, flag ausente)
 * desligaria o gate EM SILÊNCIO — `total < NaN` e `total < 0` são sempre
 * `false`. Como este script existe justamente para não aceitar verde sem
 * prova, ele recusa qualquer argumento que não entenda em vez de seguir com
 * o piso default.
 */
function pisoInteiro(key, value) {
  if (value.trim() === "") {
    throw new ErroDeUso(`--${key} veio vazio — piso ausente desliga o gate`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new ErroDeUso(
      `--${key}=${value} não é inteiro >= 0 — piso inválido desliga o gate em silêncio`,
    );
  }
  return n;
}

export function parseArgs(argv) {
  const [reportPath, ...rest] = argv;
  if (!reportPath) {
    throw new ErroDeUso(`relatório não informado. ${USO}`);
  }
  const opts = { minTests: null, minFiles: null, label: reportPath };
  for (const arg of rest) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) {
      throw new ErroDeUso(`argumento não reconhecido: ${arg}. ${USO}`);
    }
    const [, key, value] = m;
    switch (key) {
      case "min-tests":
        opts.minTests = pisoInteiro(key, value);
        break;
      case "min-files":
        opts.minFiles = pisoInteiro(key, value);
        break;
      case "label":
        opts.label = value;
        break;
      default:
        throw new ErroDeUso(`flag desconhecida --${key}. ${USO}`);
    }
  }
  if (opts.minTests === null || opts.minFiles === null) {
    throw new ErroDeUso(
      `--min-tests e --min-files são obrigatórios: sem piso o gate aprova qualquer coisa. ${USO}`,
    );
  }
  return { reportPath, ...opts };
}

export function verificarCobertura(report, opts = {}) {
  const { minTests = 0, minFiles = 0, label = "testes" } = opts;
  const totalTests = report.numTotalTests ?? 0;
  const passedTests = report.numPassedTests ?? 0;
  const failedTests = report.numFailedTests ?? 0;
  const pendingTests = report.numPendingTests ?? 0;
  const files = report.testResults ?? [];
  const totalFiles = files.length;
  const arquivosNaoOk = files.filter((f) => f.status !== "passed");
  const arquivosSemTestes = files.filter(
    (f) => !f.assertionResults || f.assertionResults.length === 0,
  );

  const problemas = [];

  if (totalTests === 0) {
    problemas.push(
      "ZERO testes executados — configuração de include/project provavelmente errada",
    );
  }
  if (totalTests < minTests) {
    problemas.push(
      `${totalTests} teste(s) executado(s), piso é ${minTests} — cobertura caiu abaixo do esperado`,
    );
  }
  if (totalFiles < minFiles) {
    problemas.push(
      `${totalFiles} arquivo(s) de teste executado(s), piso é ${minFiles} — arquivos sumiram da coleta`,
    );
  }
  if (pendingTests > 0) {
    problemas.push(
      `${pendingTests} teste(s) pulado(s) (pending/skip) — ambiente de CI nunca deveria disparar skip`,
    );
  }
  if (failedTests > 0 || arquivosNaoOk.length > 0) {
    problemas.push(
      `${failedTests} teste(s) falharam em ${arquivosNaoOk.length} arquivo(s)`,
    );
  }
  if (arquivosSemTestes.length > 0) {
    problemas.push(
      `${arquivosSemTestes.length} arquivo(s) coletado(s) mas executaram ZERO testes (coleção vazia/falso positivo)`,
    );
  }

  return {
    ok: problemas.length === 0,
    problemas,
    stats: { totalFiles, totalTests, passedTests, failedTests, pendingTests },
    arquivosNaoOk,
    arquivosSemTestes,
  };
}

export function main() {
  let argumentos;
  try {
    argumentos = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ErroDeUso)) throw err;
    console.error(`[cobertura] ${err.message}`);
    process.exit(2);
  }
  const { reportPath, minTests, minFiles, label } = argumentos;

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.error(
      `[cobertura:${label}] não consegui ler/parsear ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "[cobertura] sem relatório íntegro, não há como provar que algo rodou — falhando.",
    );
    process.exit(1);
  }

  const resultado = verificarCobertura(report, { minTests, minFiles, label });
  const { totalFiles, totalTests, passedTests, failedTests, pendingTests } =
    resultado.stats;

  console.log(
    `[cobertura:${label}] arquivos=${totalFiles} testes=${totalTests} passou=${passedTests} falhou=${failedTests} pulado=${pendingTests}`,
  );

  if (!resultado.ok) {
    console.error(`[cobertura:${label}] REPROVADO:`);
    for (const p of resultado.problemas) console.error(`  - ${p}`);
    if (resultado.arquivosNaoOk.length > 0) {
      console.error("  arquivos com problema:");
      for (const f of resultado.arquivosNaoOk)
        console.error(`    - ${f.name} (${f.status})`);
    }
    if (resultado.arquivosSemTestes.length > 0) {
      console.error("  arquivos com zero testes:");
      for (const f of resultado.arquivosSemTestes)
        console.error(`    - ${f.name} (0 asserções executadas)`);
    }
    process.exit(1);
  }

  console.log(`[cobertura:${label}] OK — exit 0 é prova, não suposição.`);
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("verificar-cobertura-testes.mjs")
) {
  main();
}
