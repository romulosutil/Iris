/**
 * Gate anti-pulo-silencioso para o job `test-e2e` (#424), no mesmo espírito
 * de `verificar-cobertura-testes.mjs` (vitest) — mas lendo o relatório JSON
 * do Playwright, que tem outro formato (`stats.expected/skipped/unexpected`,
 * `suites[].file`).
 *
 * Por que existe: a suíte `e2e/` nunca rodou em CI (#424) — sem este gate, um
 * `playwright.config.ts` mal configurado (testMatch errado, projeto que não
 * roda) sairia verde com poucos ou zero specs, do mesmo jeito que os 64/68
 * arquivos RLS pulados em silêncio (`verificar-cobertura-testes.mjs`).
 *
 * Reprova se:
 *   1. o total de testes executados (`stats.expected + stats.flaky`) ficar
 *      abaixo do piso;
 *   2. o total de ARQUIVOS de spec (`suites[].file`, distintos) ficar abaixo
 *      do piso;
 *   3. houver qualquer teste pulado (`stats.skipped > 0`);
 *   4. houver qualquer teste não-esperado (`stats.unexpected > 0` — falhou em
 *      todas as tentativas, incluindo timeout).
 *
 * Por que a contagem soma `flaky`: o Playwright move o teste que falhou e
 * passou no retry de `expected` para `flaky`. Contar só `expected` faz a
 * cobertura "cair" (16 de 17) por causa de instabilidade, não de spec sumido —
 * o gate reprovava com a mensagem errada ("cobertura caiu abaixo do esperado"),
 * apontando para o defeito que não é. Flaky segue reportado no log.
 *
 * Uso:
 *   node scripts/ci/verificar-cobertura-e2e.mjs <relatorio.json> \
 *     --min-tests=17 --min-files=10
 *
 * Pisos medidos em 23/08/2026, suíte local do zero (`pnpm seed:e2e` +
 * `pnpm test:e2e`): 10 arquivos (9 specs + `servidor.setup.ts`), 17 testes,
 * 0 falha, 0 pulado.
 */
import { readFileSync } from "node:fs";

const USO =
  "uso: node verificar-cobertura-e2e.mjs <relatorio.json> --min-tests=N --min-files=N";

export class ErroDeUso extends Error {}

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
  const opts = { minTests: null, minFiles: null };
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

export function verificarCoberturaE2E(report, opts = {}) {
  const { minTests = 0, minFiles = 0 } = opts;
  const stats = report.stats ?? {};
  const expected = stats.expected ?? 0;
  const skipped = stats.skipped ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const arquivos = new Set((report.suites ?? []).map((s) => s.file));
  // `flaky` também rodou: falhou e passou no retry. Só `unexpected` não rodou
  // com sucesso — e esse tem verificação própria abaixo.
  const executados = expected + flaky;

  const problemas = [];

  if (executados === 0) {
    problemas.push(
      "ZERO testes executados — testMatch/projects do playwright.config.ts provavelmente errado",
    );
  }
  if (executados < minTests) {
    problemas.push(
      `${executados} teste(s) executado(s), piso é ${minTests} — cobertura caiu abaixo do esperado`,
    );
  }
  if (arquivos.size < minFiles) {
    problemas.push(
      `${arquivos.size} arquivo(s) de spec executado(s), piso é ${minFiles} — specs sumiram da coleta`,
    );
  }
  if (skipped > 0) {
    problemas.push(
      `${skipped} teste(s) pulado(s) — ambiente de CI nunca deveria disparar skip`,
    );
  }
  if (unexpected > 0) {
    problemas.push(`${unexpected} teste(s) com resultado inesperado (falha)`);
  }

  return {
    ok: problemas.length === 0,
    problemas,
    stats: {
      arquivos: arquivos.size,
      executados,
      expected,
      skipped,
      unexpected,
      flaky,
    },
  };
}

export function main() {
  let argumentos;
  try {
    argumentos = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ErroDeUso)) throw err;
    console.error(`[cobertura-e2e] ${err.message}`);
    process.exit(2);
  }
  const { reportPath, minTests, minFiles } = argumentos;

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.error(
      `[cobertura-e2e] não consegui ler/parsear ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      "[cobertura-e2e] sem relatório íntegro, não há como provar que algo rodou — falhando.",
    );
    process.exit(1);
  }

  const resultado = verificarCoberturaE2E(report, { minTests, minFiles });
  const { arquivos, executados, expected, skipped, unexpected, flaky } =
    resultado.stats;

  console.log(
    `[cobertura-e2e] arquivos=${arquivos} testes=${executados} (estáveis=${expected} flaky=${flaky}) pulado=${skipped} inesperado=${unexpected}`,
  );

  if (!resultado.ok) {
    console.error("[cobertura-e2e] REPROVADO:");
    for (const p of resultado.problemas) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log("[cobertura-e2e] OK — exit 0 é prova, não suposição.");
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("verificar-cobertura-e2e.mjs")
) {
  main();
}
