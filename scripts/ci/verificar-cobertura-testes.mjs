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

function parseArgs(argv) {
  const [reportPath, ...rest] = argv;
  if (!reportPath) {
    console.error(
      "uso: node verificar-cobertura-testes.mjs <relatorio.json> --min-tests=N --min-files=N [--label=nome]",
    );
    process.exit(2);
  }
  const opts = { minTests: 0, minFiles: 0, label: reportPath };
  for (const arg of rest) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "min-tests") opts.minTests = Number(value);
    if (key === "min-files") opts.minFiles = Number(value);
    if (key === "label") opts.label = value;
  }
  return { reportPath, ...opts };
}

function main() {
  const { reportPath, minTests, minFiles, label } = parseArgs(
    process.argv.slice(2),
  );

  let raw;
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch (err) {
    console.error(
      `[cobertura:${label}] não consegui ler ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "[cobertura] sem relatório, não há como provar que algo rodou — falhando.",
    );
    process.exit(1);
  }

  /** @type {{numTotalTests:number, numPassedTests:number, numFailedTests:number, numPendingTests:number, testResults:{name:string,status:string}[]}} */
  const report = JSON.parse(raw);

  const totalTests = report.numTotalTests ?? 0;
  const passedTests = report.numPassedTests ?? 0;
  const failedTests = report.numFailedTests ?? 0;
  const pendingTests = report.numPendingTests ?? 0;
  const files = report.testResults ?? [];
  const totalFiles = files.length;
  const arquivosNaoOk = files.filter((f) => f.status !== "passed");

  const problemas = [];

  if (totalTests === 0) {
    problemas.push("ZERO testes executados — configuração de include/project provavelmente errada");
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

  console.log(
    `[cobertura:${label}] arquivos=${totalFiles} testes=${totalTests} passou=${passedTests} falhou=${failedTests} pulado=${pendingTests}`,
  );

  if (problemas.length > 0) {
    console.error(`[cobertura:${label}] REPROVADO:`);
    for (const p of problemas) console.error(`  - ${p}`);
    if (arquivosNaoOk.length > 0) {
      console.error("  arquivos com problema:");
      for (const f of arquivosNaoOk) console.error(`    - ${f.name} (${f.status})`);
    }
    process.exit(1);
  }

  console.log(`[cobertura:${label}] OK — exit 0 é prova, não suposição.`);
}

main();
